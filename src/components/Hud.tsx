import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { ITEM_BY_ID, REGION_BY_ID, MAP_W, MAP_H, TILE } from '../data/catalog.ts';
import { mainsOpen, goalProgress, goalIcon } from '../game/missions.ts';
import { store, type LogEntry } from '../game/state/store.ts';
import { COOP, PINGS } from '../data/catalog.ts';
import { logText } from './panels/Coop.tsx';
import { fmtTime } from '../utils/format.ts';
import { toast } from './ui.tsx';
import { useFarm, useTicker } from '../hooks/useStore.ts';
import { bus, type PanelId } from '../game/bus.ts';
import { xpNeed, unlocksAt } from '../game/rules.ts';
import { Medal, Modal, useCountUp } from './ui.tsx';
import { Portrait } from './FarmsScreen.tsx';
import { normalizeLook } from '../game/art/characters.ts';
import { iconUrl } from '../game/art/icons.ts';
import { buildingPortrait, useThumbs } from '../game/art/portraits.ts';
import { fmt } from '../utils/format.ts';
import { sound } from '../game/audio.ts';
import { gfx } from '../game/gfx.ts';
import { shared } from '../game/shared.ts';
import { WORLD_W, WORLD_H } from '../game/view.ts';
import type { Me } from '../App.tsx';

/** Navegação inferior: cinco entradas; o resto da fazenda fica na central "Fazenda". */
const NAV: { id: PanelId; label: string; icon: string; cat: string }[] = [
  { id: 'missions', label: 'Missões', icon: 'ui_scroll', cat: 'sky' },
  { id: 'farm', label: 'Fazenda', icon: 'ui_barn', cat: 'leaf' },
  { id: 'shop', label: 'Loja', icon: 'ui_coins', cat: 'gold' },
  { id: 'inventory', label: 'Mochila', icon: 'ui_bag', cat: 'wood' },
  { id: 'me', label: 'Personagem', icon: 'ui_people', cat: 'grape' },
];

function useSound() { return useSyncExternalStore(sound.subscribe, () => `${sound.musicOn}${sound.muted}`); }
function useGfx() { return useSyncExternalStore(gfx.subscribe, () => `${gfx.joystick}${gfx.quality}`); }
function useNarrow() {
  const q = '(max-width: 760px)';
  return useSyncExternalStore((f) => { const m = matchMedia(q); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, () => matchMedia(q).matches);
}

interface Snap { me: { x: number; y: number }; others: { x: number; y: number }[]; view: { x: number; y: number; w: number; h: number } }

function Minimap({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 176, H = Math.round((WORLD_H / WORLD_W) * W), s = W / WORLD_W;
  useEffect(() => bus.on('minimap', (snap: Snap) => {
    const c = ref.current, g = shared.ground;
    if (!c || !g) return;
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(g, 0, 0, c.width, c.height);
    x.save(); x.scale(2, 2);
    for (const r of Object.values(REGION_BY_ID)) {
      if (store.hasRegion(r.id)) continue;
      x.fillStyle = 'rgba(30,45,25,.5)'; x.fillRect(r.rect.x * TILE * s, r.rect.y * TILE * s, r.rect.w * TILE * s, r.rect.h * TILE * s);
    }
    x.strokeStyle = '#fffdf6'; x.lineWidth = 1.4; x.strokeRect(snap.view.x * s, snap.view.y * s, snap.view.w * s, snap.view.h * s);
    const dot = (tx: number, ty: number, col: string, r: number) => { x.beginPath(); x.arc(tx * TILE * s, ty * TILE * s, r, 0, Math.PI * 2); x.fillStyle = col; x.fill(); x.lineWidth = 1.2; x.strokeStyle = '#3b2c22'; x.stroke(); };
    for (const o of snap.others) dot(o.x, o.y, '#fffdf6', 3);
    dot(snap.me.x, snap.me.y, '#f6c445', 3.6);
    x.restore();
  }), [s]);
  return (
    <div className="minimap card-paper" data-testid="minimap">
      <canvas ref={ref} width={W * 2} height={H * 2} style={{ width: W, height: H }} onClick={(e) => {
        const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const tx = (e.clientX - r.left) / s / TILE, ty = (e.clientY - r.top) / s / TILE;
        if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) bus.emit('focus', { x: tx, y: ty });
      }} />
      <button className="mini-close" onClick={onClose} aria-label="Esconder mapa">×</button>
    </div>
  );
}

/** Joystick virtual (canto inferior esquerdo). Emite um vetor -1..1 no barramento. */
function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, on: false });
  const id = useRef<number | null>(null);
  const R = 44;
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ x: dx, y: dy, on: true });
    const m = Math.hypot(dx, dy) / R;
    bus.emit('joy', m < 0.18 ? { x: 0, y: 0 } : { x: (dx / R), y: (dy / R) });
  };
  const end = () => { id.current = null; setKnob({ x: 0, y: 0, on: false }); bus.emit('joy', { x: 0, y: 0 }); };
  useEffect(() => end, []);
  return (
    <div className={`joy${knob.on ? ' on' : ''}`} ref={base} aria-hidden="true" data-testid="joystick"
      onPointerDown={(e) => { id.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }}
      onPointerMove={(e) => { if (id.current === e.pointerId) move(e); }}
      onPointerUp={end} onPointerCancel={end}>
      <span className="joy-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** Item coletado: ícone voa do personagem até o medidor da mochila. */
function useGainFly() {
  useEffect(() => bus.on('gain', ({ item }: { item: string }) => {
    if (gfx.reduceMotion) return;
    const to = document.querySelector('[data-testid="hud-bag"]')?.getBoundingClientRect();
    if (!to) return;
    const img = document.createElement('img');
    img.src = iconUrl(item, 64); img.className = 'fly-ico'; img.alt = '';
    document.body.appendChild(img);
    const fx = innerWidth / 2 - 18, fy = innerHeight / 2 - 60;
    const tx = to.left + to.width / 2 - 18, ty = to.top + to.height / 2 - 18;
    const a = img.animate([
      { transform: `translate(${fx}px, ${fy}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${fx}px, ${fy - 30}px) scale(1.1)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${tx}px, ${ty}px) scale(.7)`, opacity: 1 },
    ], { duration: 820, easing: 'cubic-bezier(.5,0,.75,0)' });
    a.onfinish = () => { img.remove(); const b = document.querySelector('[data-testid="hud-bag"]'); b?.classList.remove('bump'); void (b as HTMLElement | null)?.offsetWidth; b?.classList.add('bump'); };
  }), []);
}

export function Hud({ me, onOpen, panelOpen, panel }: { me: Me; onOpen: (p: PanelId) => void; panelOpen: boolean; panel?: PanelId | null }) {
  const s = useFarm();
  useTicker(1000);
  useSound();
  useThumbs();
  useGfx();
  useGainFly();
  const narrow = useNarrow();
  const [bagAlert, setBagAlert] = useState(0);
  const [more, setMore] = useState(false);
  const [talk, setTalk] = useState(false);
  const [mapOpen, setMapOpen] = useState(() => { try { return localStorage.getItem('sm-minimap') !== '0' && innerWidth > 760; } catch { return innerWidth > 760; } });
  const [questOpen, setQuestOpen] = useState(false);
  const [modal, setModal] = useState<{ kind: 'level'; lv: number } | { kind: 'region'; id: string } | null>(null);
  const [gain, setGain] = useState<{ n: number; k: number } | null>(null);
  useEffect(() => bus.on('bagfull', () => setBagAlert(Date.now())), []);
  useEffect(() => bus.on('feed', (list: LogEntry[]) => { for (const e of list.filter((x) => x.u !== store.myId).slice(0, 2)) { const t = logText(e); toast(`${t.icon} ${t.text}`, 'info'); } }), []);
  const [pingOpen, setPingOpen] = useState(false);
  useEffect(() => bus.on('levelup', (lv: number) => setModal({ kind: 'level', lv })), []);
  const f = s.farm!;
  const nRegions = f.progression.regions.length;
  const regionsRef = useRef(nRegions);
  useEffect(() => {
    if (nRegions > regionsRef.current) setModal({ kind: 'region', id: f.progression.regions[nRegions - 1] });
    regionsRef.current = nRegions;
  }, [nRegions]); // eslint-disable-line react-hooks/exhaustive-deps
  const coinsRef = useRef(f.coins);
  useEffect(() => {
    const d = f.coins - coinsRef.current;
    coinsRef.current = f.coins;
    if (d !== 0) { setGain({ n: d, k: Date.now() }); const t = setTimeout(() => setGain(null), 1400); return () => clearTimeout(t); }
  }, [f.coins]);

  const coins = useCountUp(f.coins);
  const need = xpNeed(f.level);
  const pct = need ? f.xp / need : 1;
  const main = mainsOpen()[0];
  const [qv, qn] = main ? goalProgress(main.goal) : [0, 1];
  const done = !!main && qv >= qn;
  const gi = main ? goalIcon(main.goal) : { icon: 'star' };
  const deliverable = Object.values(s.orders).filter((o) => o.slot < 99 && Object.entries(o.items).every(([k, q]) => s.qty(k) + (s.bag()[k] ?? 0) >= q)).length;
  const ms = f.progression.ms;
  const claimable = [...(ms?.side ?? []), ...(ms?.daily?.l ?? []), ms?.coop ?? null].filter((m) => m && !m.done && (f.progression.stats[m.k] ?? 0) - m.base >= m.n).length + (done ? 1 : 0);
  const joy = gfx.joystick;
  const open = (p: PanelId) => { setMore(false); onOpen(p); };
  const toggleMap = () => { const v = !mapOpen; setMapOpen(v); try { localStorage.setItem('sm-minimap', v ? '1' : '0'); } catch { /* */ } };
  const myLook = normalizeLook(me.look);
  const fair = f.progression.fair;
  let fairNeed = 0, fairGot = 0;
  if (fair) for (const [k, q] of Object.entries(fair.goal)) { const p = ITEM_BY_ID[k]?.price ?? 1; fairNeed += q * p; fairGot += Math.min(q, fair.got[k] ?? 0) * p; }
  const fairPct = fairNeed ? Math.floor((100 * fairGot) / fairNeed) : 0;
  const fairReady = !!fair && COOP.fair.tiers.some((t, i) => fairPct >= t.pct * 100 && !fair.claimed.includes(String(i)));
  void bagAlert; void ITEM_BY_ID;

  return (
    <>
      {/* barra superior: avatar com nível e XP, moedas, cristais | jogadores e menu */}
      <header className="topbar">
        <div className="tb-left">
          <button className="hud-me" onClick={() => open('me')} aria-label={`Personagem, nível ${f.level}`} data-testid="hud-level" style={{ ['--p' as string]: `${pct * 360}deg` }}>
            <Portrait look={myLook} scale={0.42} className="hud-face" />
            <b className="hud-lv">{f.level}</b>
          </button>
          <div className="tb-res">
            <div className="res-row">
              <span className="res res-coin" data-testid="hud-coins">
                <img src={iconUrl('coin', 64)} alt="" /><b>{fmt(coins)}</b>
                {gain && <em key={gain.k} className={gain.n > 0 ? 'gain up' : 'gain down'}>{gain.n > 0 ? '+' : ''}{fmt(gain.n)}</em>}
              </span>
              <button className="res res-cr" onClick={() => open('shop')} data-testid="hud-crystals" title="Cristais"><i aria-hidden>💎</i><b>{fmt(f.crystals ?? 0)}</b></button>
              <button className={`res res-bag${s.bagUsed() >= s.bagCap() ? ' full' : ''}${Date.now() - bagAlert < 2500 ? ' alert' : ''}`} onClick={() => open('inventory')} title="Mochila (leve ao Celeiro para guardar)" data-testid="hud-bag">
                <i className="bag-ico" aria-hidden>🎒</i><b>{s.bagUsed()}/{s.bagCap()}</b><span className="bag-fill" style={{ width: `${Math.min(100, (100 * s.bagUsed()) / s.bagCap())}%` }} />
              </button>
            </div>
            <div className="xpbar" title={need ? `${fmt(f.xp)} / ${fmt(need)} XP` : 'Nível máximo'}><span style={{ width: `${pct * 100}%` }} /></div>
          </div>
        </div>
        <div className="tb-right">
          <button className="team-stack" onClick={() => open('team')} aria-label="Equipe" data-testid="hud-team">
            {s.members.filter((m) => m.user_id !== me.id).slice(0, narrow ? 2 : 3).map((m) => (
              <span key={m.user_id} className={`pl${s.online.has(m.user_id) ? ' on' : ''}`} title={`${m.username}${s.online.has(m.user_id) ? ' (jogando)' : ''}`}>
                <Portrait look={normalizeLook(m.look)} className="pl-face" />
              </span>
            ))}
            <b>👥{s.members.length > 1 ? ` ${[...s.online].filter((u) => u !== me.id).length}/${s.members.length - 1}` : ''}</b>
          </button>
          <span className={`net${s.connected ? ' ok' : ''}`} title={s.connected ? 'Conectado em tempo real' : 'Reconectando…'} data-testid="net-status">{s.connected ? 'online' : 'reconectando'}</span>
          <button className={`ibtn${more ? ' on' : ''}`} onClick={() => setMore(!more)} aria-label="Mais opções" aria-expanded={more} data-testid="dock-more">
            <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="5" cy="12" r="2.2" fill="currentColor" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /><circle cx="19" cy="12" r="2.2" fill="currentColor" /></svg>
          </button>
        </div>
      </header>
      {more && (
        <div className="more-sheet card-paper" role="menu">
          <button className="more-item cat-sky" onClick={() => { setMore(false); toggleMap(); }}><img src={iconUrl('ui_map', 64)} alt="" />{mapOpen ? 'Esconder mapa' : 'Mostrar mapa'}</button>
          <button className="more-item cat-sky" onClick={() => { setTalk(!talk); setMore(false); }}><img src={iconUrl('ui_chat', 64)} alt="" />Falar com o grupo</button>
          <button className={`more-item cat-gold${sound.musicOn ? '' : ' off'}`} onClick={() => { sound.unlock(); sound.setMusicOn(!sound.musicOn); }}><img src={iconUrl('ui_music', 64)} alt="" />Música {sound.musicOn ? 'ligada' : 'desligada'}</button>
          <button className="more-item" onClick={() => { setMore(false); bus.emit('recenter'); }}><img src={iconUrl('ui_map', 64)} alt="" />Centralizar</button>
          <button className="more-item cat-steel" onClick={() => open('settings')}><img src={iconUrl('ui_gear', 64)} alt="" />Ajustes</button>
        </div>
      )}

      {!panelOpen && mapOpen && <div className="map-slot"><Minimap onClose={toggleMap} /></div>}
      {talk && (
        <div className="talk card-paper">
          {['Olá!', 'Me ajuda aqui!', 'Vou colher', 'Vou produzir', 'Valeu!'].map((t) => (
            <button key={t} className="chip" onClick={() => { bus.emit('emote', t); setTalk(false); setMore(false); }}>{t}</button>
          ))}
        </div>
      )}

      {!panelOpen && (
        <div className="status-chips">
          {(f.progression.bell?.until ?? 0) > s.now() && <button className="schip bell" onClick={() => open('team')} data-testid="chip-bell">🔔 Mutirão {fmtTime((f.progression.bell?.until ?? 0) - s.now())}</button>}
          {f.progression.fair && <button className="schip fair" onClick={() => open('fair')} data-testid="chip-fair">🎪 Feira {fairPct}%{fairReady ? ' · prêmio!' : ''}</button>}
        </div>
      )}

      {/* missão principal: pílula compacta no canto (o centro fica livre para o mundo) */}
      {!panelOpen && main && (
        <div className={`quest-pill${done ? ' quest-done' : ''}${questOpen ? ' wide' : ''}`} data-testid="quest-card">
          <button className="quest-pill-open" onClick={() => open('missions')} aria-label="Abrir missões">
            <Medal icon={gi.icon} src={gi.building ? buildingPortrait(gi.building, 96) : undefined} size={28} tone={done ? 'folha' : 'esm'} />
            <span>{done ? 'Missão cumprida! Toque para receber' : main.title}</span>
            <i className="qp-n">{qv}/{qn}</i>
          </button>
          <button className="quest-fold" onClick={() => setQuestOpen(!questOpen)} aria-label={questOpen ? 'Recolher' : 'Expandir'}>{questOpen ? '−' : '+'}</button>
          <span className="qp-bar"><i style={{ width: `${Math.min(100, (100 * qv) / Math.max(1, qn))}%` }} /></span>
          {questOpen && <p className="qp-desc">{main.desc}</p>}
        </div>
      )}

      {/* controles do mundo */}
      {!panelOpen && joy && <Joystick />}
      {!panelOpen && (
        <div className="ping-fab">
          {pingOpen && <div className="ping-menu card-paper">{PINGS.map((p) => <button key={p.k} className="chip" onClick={() => { bus.emit('ping', p.k); setPingOpen(false); }}>{p.icon} {p.text}</button>)}</div>}
          <button className={`ibtn ping-btn${pingOpen ? ' on' : ''}`} onClick={() => setPingOpen(!pingOpen)} aria-label="Avisar o grupo" aria-expanded={pingOpen} data-testid="ping-btn">📣</button>
        </div>
      )}
      <div className="hud-actions">
        {!narrow && (
          <div className="zoom">
            <button className="ibtn" onClick={() => bus.emit('zoom', 1.15)} aria-label="Aproximar">+</button>
            <button className="ibtn" onClick={() => bus.emit('zoom', 0.87)} aria-label="Afastar">−</button>
            <button className="ibtn" onClick={() => bus.emit('recenter')} aria-label="Centralizar no personagem">
              <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="4" fill="currentColor" /><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* navegação inferior */}
      <nav className="nav" aria-label="Menus">
        {NAV.map(({ id, label, icon, cat }) => {
          const badge = id === 'missions' ? claimable : id === 'farm' ? deliverable : 0;
          return (
            <button key={String(id)} className={`nav-btn cat-${cat}${panel === id ? ' on' : ''}`} onClick={() => open(id)} data-testid={`dock-${String(id)}`}>
              <span className="nav-ico"><img src={iconUrl(icon, 96)} alt="" /></span>
              <span className="nav-label">{label}</span>
              {badge > 0 && <em className="badge">{badge}</em>}
            </button>
          );
        })}
      </nav>

      {modal?.kind === 'level' && (() => {
        const u = unlocksAt(modal.lv);
        const items = [...u.crops.map((c) => c.id), ...u.recipes.map((r) => r.id)];
        return (
          <Modal kicker="A fazenda cresceu" title={`Nível ${modal.lv}!`} onClose={() => setModal(null)}>
            <p className="modal-sub">Recompensa: {25 * modal.lv} moedas e 💎 2 cristais para a fazenda.</p>
            {(u.buildings.length + u.regions.length + items.length + u.tools.length) > 0 && (
              <div className="unlocks">
                {u.regions.map((r) => <div key={r.id} className="unlock"><Medal icon="ui_map" size={54} tone="folha" /><span>{r.name}</span></div>)}
                {u.buildings.map((b) => <div key={b.id} className="unlock"><Medal src={buildingPortrait(b.id, 96)} size={54} /><span>{b.name}</span></div>)}
                {u.tools.map(({ x }) => <div key={x.name} className="unlock"><Medal icon="ui_tools" size={54} /><span>{x.name}</span></div>)}
                {items.map((i) => <div key={i} className="unlock"><Medal icon={i} size={54} /><span>{ITEM_BY_ID[i].name}</span></div>)}
              </div>
            )}
          </Modal>
        );
      })()}
      {modal?.kind === 'region' && (
        <Modal kicker="Nova região aberta" title={REGION_BY_ID[modal.id].name} onClose={() => { setModal(null); const r = REGION_BY_ID[modal.id].rect; bus.emit('focus', { x: r.x + r.w / 2, y: r.y + r.h / 2 }); }} action="Ver no mapa">
          <p className="modal-sub">{REGION_BY_ID[modal.id].desc}</p>
        </Modal>
      )}
    </>
  );
}
