import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { QUESTS, MAX_LEVEL, ITEM_BY_ID, REGION_BY_ID, MAP_W, MAP_H, TILE, type QuestGoal } from '../data/catalog.ts';
import { useFarm, useTicker } from '../hooks/useStore.ts';
import { bus, type PanelId } from '../game/bus.ts';
import { capacity, xpNeed, unlocksAt } from '../game/rules.ts';
import { Medal, Modal, useCountUp } from './ui.tsx';
import { Portrait } from './FarmsScreen.tsx';
import { normalizeLook } from '../game/art/characters.ts';
import { iconUrl } from '../game/art/icons.ts';
import { buildingPortrait, useThumbs } from '../game/art/portraits.ts';
import { store } from '../game/state/store.ts';
import { errorText } from '../utils/errors.ts';
import { fmt } from '../utils/format.ts';
import { play, sound } from '../game/audio.ts';
import { gfx } from '../game/gfx.ts';
import { shared } from '../game/shared.ts';
import { WORLD_W, WORLD_H } from '../game/view.ts';
import type { Me } from '../App.tsx';

export function goalProgress(g: QuestGoal): [number, number] {
  const f = store.farm!;
  switch (g.k) {
    case 'stat': return [Math.min(g.n, f.progression.stats[g.key] ?? 0), g.n];
    case 'built': return [Math.min(g.lv, store.lvl(g.b)), g.lv];
    case 'tool': return [Math.min(g.tier, store.tool(g.tool)), g.tier];
    case 'region': return [store.hasRegion(g.r) ? 1 : 0, 1];
    case 'level': return [Math.min(g.n, f.level), g.n];
  }
}

/** Ícone que representa o objetivo da missão. */
function goalIcon(g: QuestGoal): { icon?: string; src?: string } {
  if (g.k === 'built') return { src: buildingPortrait(g.b, 96) };
  if (g.k === 'tool') return { icon: 'ui_tools' };
  if (g.k === 'region') return { icon: 'ui_map' };
  if (g.k === 'level') return { icon: 'ui_progress' };
  const [kind, item] = g.key.split(':');
  if (item && ITEM_BY_ID[item]) return { icon: item };
  return { icon: kind === 'plant' ? 'wheat' : kind === 'sold' ? 'ui_coins' : kind === 'orders' || kind === 'contracts' ? 'ui_scroll' : kind === 'cgive' ? 'ui_people' : 'star' };
}

/** Navegação: as quatro primeiras ficam sempre na barra; o resto entra em "Mais" no celular. */
const NAV: { id: string; label: string; icon: string; cat: string }[] = [
  { id: 'inventory', label: 'Estoque', icon: 'ui_bag', cat: 'leaf' },
  { id: 'sell', label: 'Mercado', icon: 'ui_coins', cat: 'gold' },
  { id: 'projects', label: 'Projetos', icon: 'ui_build', cat: 'wood' },
  { id: 'orders', label: 'Pedidos', icon: 'ui_scroll', cat: 'sky' },
  { id: 'tools', label: 'Ferramentas', icon: 'ui_tools', cat: 'steel' },
  { id: 'progress', label: 'Progresso', icon: 'ui_progress', cat: 'grape' },
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
  const [questOpen, setQuestOpen] = useState(() => innerWidth > 760);
  const [modal, setModal] = useState<{ kind: 'level'; lv: number } | { kind: 'region'; id: string } | null>(null);
  const [gain, setGain] = useState<{ n: number; k: number } | null>(null);
  useEffect(() => bus.on('bagfull', () => setBagAlert(Date.now())), []);
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
  const qi = f.progression.quest;
  const quest = QUESTS[qi];
  const [qv, qn] = quest ? goalProgress(quest.goal) : [0, 1];
  const done = quest && qv >= qn;
  const used = s.invTotal(), cap = capacity();
  const nextLv = Math.min(MAX_LEVEL, f.level + 1);
  const nu = unlocksAt(nextLv);
  const nextNames = [...nu.regions.map((r) => r.name), ...nu.buildings.map((b) => b.name), ...nu.crops.map((c) => ITEM_BY_ID[c.id].name), ...nu.recipes.map((r) => ITEM_BY_ID[r.id].name)].slice(0, 3);
  const deliverable = Object.values(s.orders).filter((o) => o.slot < 99 && Object.entries(o.items).every(([k, q]) => s.qty(k) >= q)).length;
  const projs = s.projects().length;
  const gi = quest ? goalIcon(quest.goal) : { icon: 'star' };
  const joy = gfx.joystick;
  const nav = narrow ? NAV.slice(0, 4) : NAV;
  const open = (p: PanelId) => { setMore(false); onOpen(p); };
  const toggleMap = () => { const v = !mapOpen; setMapOpen(v); try { localStorage.setItem('sm-minimap', v ? '1' : '0'); } catch { /* */ } };

  const claim = async () => {
    const r = await store.act({ t: 'quest' });
    if (r.ok) { play('coin'); bus.emit('cheer'); bus.emit('toast', { kind: 'ok', text: `Missão cumprida: ${quest.title}! +${quest.coins} moedas`, icon: 'ui_coins' }); }
    else bus.emit('toast', { kind: 'warn', text: errorText(r.e) });
  };

  return (
    <>
      {/* barra superior compacta: nível, moedas, celeiro | jogadores, mapa, ajustes */}
      <header className="topbar">
        <div className="tb-left">
          <button className="lv-badge" onClick={() => open('progress')} aria-label={`Nível ${f.level}, ver progressão`} style={{ ['--p' as string]: `${pct * 360}deg` }} data-testid="hud-level">
            <b>{f.level}</b>
          </button>
          <div className="tb-res">
            <span className="farm-title" title={f.name}>{f.name}</span>
            <div className="res-row">
              <span className="res res-coin" data-testid="hud-coins">
                <img src={iconUrl('coin', 64)} alt="" /><b>{fmt(coins)}</b>
                {gain && <em key={gain.k} className={gain.n > 0 ? 'gain up' : 'gain down'}>{gain.n > 0 ? '+' : ''}{fmt(gain.n)}</em>}
              </span>
              <button className={`res res-btn${used >= cap ? ' full' : ''}`} onClick={() => open('inventory')} title="Ocupação do celeiro"><img src={iconUrl('ui_barn', 64)} alt="" /><b>{used}/{cap}</b></button>
              <button className={`res res-bag${s.bagUsed() >= s.bagCap() ? ' full' : ''}${Date.now() - bagAlert < 2500 ? ' alert' : ''}`} onClick={() => open('inventory')} title="Mochila (leve ao Celeiro para guardar)" data-testid="hud-bag">
                <i className="bag-ico" aria-hidden>🎒</i><b>{s.bagUsed()}/{s.bagCap()}</b><span className="bag-fill" style={{ width: `${Math.min(100, (100 * s.bagUsed()) / s.bagCap())}%` }} />
              </button>
              <span className="res res-rep" title="Reputação"><img src={iconUrl('star', 64)} alt="" /><b>{f.reputation}</b></span>
            </div>
            <div className="xpbar" title={need ? `${fmt(f.xp)} / ${fmt(need)} XP` : 'Nível máximo'}><span style={{ width: `${pct * 100}%` }} /></div>
          </div>
        </div>
        <div className="tb-right">
          <div className="players" aria-label="Membros da fazenda">
            {s.members.map((m) => (
              <div key={m.user_id} className={`pl${s.online.has(m.user_id) ? ' on' : ''}`} title={`${m.username}${s.online.has(m.user_id) ? ' (online)' : ' (offline)'}`}>
                <Portrait look={normalizeLook(m.user_id === me.id ? me.look : m.look)} scale={0.36} className="pl-face" />
              </div>
            ))}
            <span className={`net${s.connected ? ' ok' : ''}`} title={s.connected ? 'Conectado em tempo real' : 'Reconectando…'} data-testid="net-status">{s.connected ? 'online' : 'reconectando'}</span>
          </div>
          <button className={`ibtn${mapOpen ? ' on' : ''}`} onClick={toggleMap} aria-label={mapOpen ? 'Esconder mapa' : 'Mostrar mapa'} aria-pressed={mapOpen}><img src={iconUrl('ui_map', 64)} alt="" /></button>
          {!narrow && <button className={`ibtn${sound.musicOn ? '' : ' off'}`} onClick={() => { sound.unlock(); sound.setMusicOn(!sound.musicOn); }} aria-label={sound.musicOn ? 'Desligar música' : 'Ligar música'} aria-pressed={sound.musicOn}><img src={iconUrl('ui_music', 64)} alt="" /></button>}
          {!narrow && <button className="ibtn" onClick={() => setTalk(!talk)} aria-label="Falar com o grupo"><img src={iconUrl('ui_chat', 64)} alt="" /></button>}
          <button className="ibtn" onClick={() => open('settings')} aria-label="Ajustes"><img src={iconUrl('ui_gear', 64)} alt="" /></button>
        </div>
      </header>

      {!panelOpen && mapOpen && <div className="map-slot"><Minimap onClose={toggleMap} /></div>}
      {talk && (
        <div className="talk card-paper">
          {['Olá!', 'Me ajuda aqui!', 'Vou colher', 'Vou produzir', 'Valeu!'].map((t) => (
            <button key={t} className="chip" onClick={() => { bus.emit('emote', t); setTalk(false); setMore(false); }}>{t}</button>
          ))}
        </div>
      )}

      {/* missão: cartão compacto (recolhível) */}
      {!panelOpen && quest && (questOpen ? (
        <div className={`quest card-paper${done ? ' quest-done' : ''}`} data-testid="quest-card">
          <button className="quest-fold" onClick={() => setQuestOpen(false)} aria-label="Recolher missão">−</button>
          <div className="quest-main">
            <Medal {...gi} size={42} tone={done ? 'folha' : 'esm'} />
            <div className="quest-text">
              <span className="quest-n">Missão {qi + 1}/{QUESTS.length}</span>
              <strong>{quest.title}</strong>
              <p>{quest.desc}</p>
            </div>
          </div>
          <div className="quest-foot">
            <div className="bar bar-folha"><span style={{ width: `${(qv / qn) * 100}%` }} /></div>
            <span className="quest-count">{qv}/{qn}</span>
          </div>
          <div className="quest-reward">
            <span className="chip-r"><img src={iconUrl('coin', 64)} alt="" />{quest.coins}</span>
            <span className="chip-r"><img src={iconUrl('ui_xp', 64)} alt="" />{quest.xp} XP</span>
            {done && <button className="btn btn-primary btn-sm glow" onClick={claim} data-testid="quest-claim">Receber</button>}
          </div>
          {nextNames.length > 0 && <p className="next-unlock"><img src={iconUrl('ui_lock', 64)} alt="" />Nível {nextLv}: {nextNames.join(', ')}</p>}
        </div>
      ) : (
        <div className={`quest-pill${done ? ' quest-done' : ''}`} data-testid="quest-card">
          <button className="quest-pill-open" onClick={() => setQuestOpen(true)} aria-label="Abrir missão">
            <Medal {...gi} size={28} tone={done ? 'folha' : 'esm'} />
            <span>{done ? 'Missão cumprida!' : quest.title}</span>
            <i className="qp-n">{qv}/{qn}</i>
          </button>
          {done && <button className="btn btn-primary btn-sm glow" onClick={claim} data-testid="quest-claim">Receber</button>}
        </div>
      ))}

      {/* controles do mundo */}
      {!panelOpen && joy && <Joystick />}
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
        {nav.map(({ id, label, icon, cat }) => {
          const badge = id === 'projects' ? projs : id === 'orders' ? deliverable : 0;
          return (
            <button key={id} className={`nav-btn cat-${cat}${panel === id ? ' on' : ''}`} onClick={() => open(id as PanelId)} data-testid={`dock-${id}`}>
              <span className="nav-ico"><img src={iconUrl(icon, 96)} alt="" /></span>
              <span className="nav-label">{label}</span>
              {badge > 0 && <em className="badge">{badge}</em>}
            </button>
          );
        })}
        {narrow && (
          <button className={`nav-btn cat-steel${more ? ' on' : ''}`} onClick={() => setMore(!more)} data-testid="dock-more" aria-expanded={more}>
            <span className="nav-ico"><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="5" cy="12" r="2.4" fill="currentColor" /><circle cx="12" cy="12" r="2.4" fill="currentColor" /><circle cx="19" cy="12" r="2.4" fill="currentColor" /></svg></span>
            <span className="nav-label">Mais</span>
          </button>
        )}
      </nav>
      {more && narrow && (
        <div className="more-sheet card-paper" role="menu">
          {NAV.slice(4).map(({ id, label, icon, cat }) => (
            <button key={id} className={`more-item cat-${cat}`} onClick={() => open(id as PanelId)} data-testid={`dock-${id}`}><img src={iconUrl(icon, 64)} alt="" />{label}</button>
          ))}
          <button className="more-item cat-leaf" onClick={() => open('character')}><img src={iconUrl('ui_people', 64)} alt="" />Aparência</button>
          <button className="more-item cat-sky" onClick={() => { setTalk(!talk); }}><img src={iconUrl('ui_chat', 64)} alt="" />Falar</button>
          <button className={`more-item cat-gold${sound.musicOn ? '' : ' off'}`} onClick={() => { sound.unlock(); sound.setMusicOn(!sound.musicOn); }}><img src={iconUrl('ui_music', 64)} alt="" />Música {sound.musicOn ? 'ligada' : 'desligada'}</button>
          <button className="more-item" onClick={() => { setMore(false); bus.emit('recenter'); }}><img src={iconUrl('ui_map', 64)} alt="" />Centralizar</button>
        </div>
      )}

      {modal?.kind === 'level' && (() => {
        const u = unlocksAt(modal.lv);
        const items = [...u.crops.map((c) => c.id), ...u.recipes.map((r) => r.id)];
        return (
          <Modal kicker="A fazenda cresceu" title={`Nível ${modal.lv}!`} onClose={() => setModal(null)}>
            <p className="modal-sub">Recompensa: {25 * modal.lv} moedas para o caixa da fazenda.</p>
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
