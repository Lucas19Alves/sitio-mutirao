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
import { sound, play } from '../game/audio.ts';
import { voice } from '../game/multiplayer/voice.ts';
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

function useVoice() { return useSyncExternalStore(voice.subscribe, voice.getVersion); }
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

/** Contador de combo na tela (some 2,5 s depois da última coleta). */
function useCombo() {
  const [c, setC] = useState(0);
  useEffect(() => { let t = 0; return bus.on('combo', (n: number) => { setC(n); clearTimeout(t); t = window.setTimeout(() => setC(0), 2500); }); }, []);
  return c;
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
  // minimapa: desligado por padrão; liga em Ajustes
  const [mapOpen, setMapOpen] = useState(() => { try { return localStorage.getItem('sm-minimap') === '1'; } catch { return false; } });
  useEffect(() => bus.on('minimap:set', (v: boolean) => setMapOpen(v)), []);
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
  // missão ficou pronta agora: som, brilho e aviso (recompensa antecipada)
  const doneRef = useRef(done);
  useEffect(() => {
    if (done && !doneRef.current && main) { play('ready'); toast(`✨ Missão pronta: ${main.title}! Toque para receber.`, 'ok'); }
    doneRef.current = done;
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  const comboN = useCombo();
  useVoice();
  const talking = (voice.levels.get(me.id) ?? 0) > 0.06;
  const open = (p: PanelId) => { setPingOpen(false); onOpen(p); };
  const closeMap = () => { setMapOpen(false); try { localStorage.setItem('sm-minimap', '0'); } catch { /* */ } };
  const myLook = normalizeLook(me.look);
  const fair = f.progression.fair;
  let fairNeed = 0, fairGot = 0;
  if (fair) for (const [k, q] of Object.entries(fair.goal)) { const p = ITEM_BY_ID[k]?.price ?? 1; fairNeed += q * p; fairGot += Math.min(q, fair.got[k] ?? 0) * p; }
  const fairPct = fairNeed ? Math.floor((100 * fairGot) / fairNeed) : 0;
  const fairReady = !!fair && COOP.fair.tiers.some((t, i) => fairPct >= t.pct * 100 && !fair.claimed.includes(String(i)));

  const others = s.members.filter((m) => m.user_id !== me.id);
  const onlineOthers = others.filter((m) => s.online.has(m.user_id));
  const bellLeft = (f.progression.bell?.until ?? 0) - s.now();
  const bagPct = Math.min(100, (100 * s.bagUsed()) / s.bagCap());
  const hide = panelOpen && narrow; // no celular, um menu aberto ocupa a tela: a HUD sai do caminho

  return (
    <>
      {/* esquerda em cima: perfil (anel de XP + nível), moedas, cristais, mochila e, logo abaixo, a missão */}
      {!hide && (
        <div className="hud-tl">
          <div className="hud-card" data-testid="hud-card">
            <button className="hud-me" onClick={() => open('me')} aria-label={`Personagem, nível ${f.level}`} data-testid="hud-level" title={need ? `Nível ${f.level} · ${fmt(f.xp)}/${fmt(need)} XP` : 'Nível máximo'} style={{ ['--p' as string]: `${pct * 360}deg` }}>
              <Portrait look={myLook} className="hud-face" />
              <b className="hud-lv">{f.level}</b>
            </button>
            <span className="hud-res" data-testid="hud-coins" title="Moedas da fazenda">
              <img src={iconUrl('coin', 64)} alt="" /><b>{fmt(coins)}</b>
              {gain && <em key={gain.k} className={gain.n > 0 ? 'gain up' : 'gain down'}>{gain.n > 0 ? '+' : ''}{fmt(gain.n)}</em>}
            </span>
            <button className="hud-res cr" onClick={() => open('shop')} data-testid="hud-crystals" title="Cristais (loja)"><i aria-hidden>💎</i><b>{fmt(f.crystals ?? 0)}</b></button>
            <button className={`hud-res bag${s.bagUsed() >= s.bagCap() ? ' full' : ''}${Date.now() - bagAlert < 2500 ? ' alert' : ''}`} onClick={() => open('inventory')} title="Mochila: leve ao Celeiro para guardar" data-testid="hud-bag" style={{ ['--f' as string]: `${bagPct}%` }}>
              <i aria-hidden>🎒</i><b>{s.bagUsed()}<small>/{s.bagCap()}</small></b>
            </button>
          </div>
          {main && !panelOpen && (
            <button className={`hud-quest${done ? ' done' : ''}`} onClick={() => open('missions')} data-testid="quest-card" style={{ ['--q' as string]: `${Math.min(100, (100 * qv) / Math.max(1, qn))}%` }}>
              <Medal icon={gi.icon} src={gi.building ? buildingPortrait(gi.building, 96) : undefined} size={22} tone={done ? 'folha' : 'esm'} />
              <span>{done ? 'Pronta! Toque para receber' : main.title}</span>
              <i>{done ? '✨' : `${qv}/${qn}`}</i>
            </button>
          )}
        </div>
      )}

      {/* direita em cima: o que está acontecendo (só quando importa), equipe e a engrenagem */}
      {!hide && (
        <div className="hud-tr">
          {bellLeft > 0 && <button className="hud-pip bell" onClick={() => open('team')} data-testid="chip-bell" title="Sino do Mutirão tocando">🔔<small>{fmtTime(bellLeft)}</small></button>}
          {fairReady && <button className="hud-pip fair" onClick={() => open('fair')} data-testid="chip-fair" title={`Feira da Vila: ${fairPct}%`}>🎪<small>prêmio!</small></button>}
          {!s.connected && <span className="hud-pip warn" title="Sem conexão: tentando de novo" data-testid="net-status">⚠️<small>reconectando</small></span>}
          {others.length > 0 && (
            <button className="hud-team" onClick={() => open('team')} aria-label={`Equipe: ${onlineOthers.length} jogando agora`} data-testid="hud-team">
              {(onlineOthers.length ? onlineOthers : others).slice(0, narrow ? 2 : 3).map((m) => (
                <span key={m.user_id} className={`pl${s.online.has(m.user_id) ? ' on' : ''}${(voice.levels.get(m.user_id) ?? 0) > 0.06 ? ' talking' : ''}`} title={m.username}><Portrait look={normalizeLook(m.look)} className="pl-face" /></span>
              ))}
              {onlineOthers.length > 0 && <b>{onlineOthers.length}</b>}
            </button>
          )}
          <button className="hud-gear" onClick={() => open('settings')} aria-label="Configurações" data-testid="hud-settings">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.7 7.7 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.7 7.7 0 0 0 1.7-1l2.5 1 2-3.5ZM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)" /></svg>
          </button>
        </div>
      )}

      {!panelOpen && mapOpen && <div className="map-slot"><Minimap onClose={closeMap} /></div>}

      {comboN > 0 && <div className="combo-badge" key={comboN}>Combo <b>x{comboN}</b></div>}

      {/* embaixo: joystick (celular) e, à direita, voz e sinal rápido */}
      {!panelOpen && joy && <Joystick />}
      {!panelOpen && (
        <div className="hud-br">
          {pingOpen && <div className="ping-menu card-paper" role="menu">{PINGS.map((p) => <button key={p.k} className="chip" onClick={() => { bus.emit('ping', p.k); setPingOpen(false); }}>{p.icon} {p.text}</button>)}</div>}
          <button className={`hud-round ping${pingOpen ? ' on' : ''}`} onClick={() => setPingOpen(!pingOpen)} aria-label="Avisar o grupo" aria-expanded={pingOpen} data-testid="ping-btn">📣</button>
          {voice.on && (
            <button className={`hud-round mic${voice.micOn && !voice.micDenied ? ' live' : ' off'}${talking ? ' talking' : ''}`} data-testid="mic-btn"
              onClick={() => { if (voice.micDenied) toast('Microfone bloqueado. Libere no cadeado da barra de endereço.', 'warn'); else { voice.setMic(!voice.micOn); toast(voice.micOn ? '🎙️ Microfone ligado' : '🔇 Microfone desligado', 'info'); } }}
              aria-label={voice.micOn ? 'Silenciar microfone' : 'Ligar microfone'} aria-pressed={voice.micOn}>{voice.micDenied || !voice.micOn ? '🔇' : '🎙️'}</button>
          )}
        </div>
      )}

      {/* navegação */}
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
