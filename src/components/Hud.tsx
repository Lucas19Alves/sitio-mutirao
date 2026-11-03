import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { QUESTS, MAX_LEVEL, ITEM_BY_ID, REGION_BY_ID, MAP_W, MAP_H, type QuestGoal } from '../data/catalog.ts';
import { useFarm, useTicker } from '../hooks/useStore.ts';
import { bus, type PanelId } from '../game/bus.ts';
import { capacity, xpNeed, unlocksAt } from '../game/rules.ts';
import { Medal, Modal, useCountUp, ItemIcon } from './ui.tsx';
import { Portrait } from './FarmsScreen.tsx';
import { normalizeLook } from '../game/art/characters.ts';
import { iconUrl } from '../game/art/icons.ts';
import { buildingPortrait } from '../game/art/portraits.ts';
import { store } from '../game/state/store.ts';
import { errorText } from '../utils/errors.ts';
import { fmt } from '../utils/format.ts';
import { play, sound } from '../game/audio.ts';
import { shared } from '../game/shared.ts';
import { isoTile, screenToTile, WORLD_W, WORLD_H } from '../game/iso.ts';
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

const DOCK: [string, string, string][] = [
  ['inventory', 'Estoque', 'ui_bag'], ['sell', 'Mercado', 'ui_coins'], ['projects', 'Projetos', 'ui_build'],
  ['orders', 'Pedidos', 'ui_scroll'], ['tools', 'Ferramentas', 'ui_tools'], ['progress', 'Progresso', 'ui_progress'],
];

function useSound() { return useSyncExternalStore(sound.subscribe, () => `${sound.musicOn}${sound.muted}`); }

interface Snap { me: { x: number; y: number }; others: { x: number; y: number }[]; view: { x: number; y: number; w: number; h: number } }

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('sm-minimap') !== '0' && window.innerWidth > 720; } catch { return true; } });
  const W = 208, H = Math.round((WORLD_H / WORLD_W) * W), s = W / WORLD_W;
  const thumb = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!open) return;
    return bus.on('minimap', (snap: Snap) => {
      const c = ref.current, g = shared.ground;
      if (!c || !g) return;
      if (!thumb.current) { const t = document.createElement('canvas'); t.width = W * 2; t.height = H * 2; const tc = t.getContext('2d')!; tc.imageSmoothingQuality = 'high'; tc.drawImage(g, 0, 0, t.width, t.height); thumb.current = t; }
      const x = c.getContext('2d')!;
      x.clearRect(0, 0, c.width, c.height);
      x.drawImage(thumb.current, 0, 0);
      x.save(); x.scale(2, 2);
      for (const r of Object.values(REGION_BY_ID)) {
        if (store.hasRegion(r.id)) continue;
        const pts = [isoTile(r.rect.x, r.rect.y), isoTile(r.rect.x + r.rect.w, r.rect.y), isoTile(r.rect.x + r.rect.w, r.rect.y + r.rect.h), isoTile(r.rect.x, r.rect.y + r.rect.h)];
        x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p.x * s, p.y * s) : x.moveTo(p.x * s, p.y * s))); x.closePath(); x.fillStyle = 'rgba(20,35,20,.55)'; x.fill();
      }
      x.strokeStyle = '#f7f8f4'; x.lineWidth = 1.2; x.strokeRect(snap.view.x * s, snap.view.y * s, snap.view.w * s, snap.view.h * s);
      const dot = (tx: number, ty: number, col: string, r: number) => { const p = isoTile(tx, ty); x.beginPath(); x.arc(p.x * s, p.y * s, r, 0, Math.PI * 2); x.fillStyle = col; x.fill(); x.lineWidth = 1.2; x.strokeStyle = '#1d3b72'; x.stroke(); };
      for (const o of snap.others) dot(o.x, o.y, '#f7f8f4', 3.2);
      dot(snap.me.x, snap.me.y, '#f2b632', 3.8);
      x.restore();
    });
  }, [open, H, s]);
  const toggle = () => { setOpen(!open); try { localStorage.setItem('sm-minimap', open ? '0' : '1'); } catch { /* */ } };
  if (!open) return <button className="round-btn" onClick={toggle} aria-label="Mostrar mapa"><img src={iconUrl('ui_map', 64)} alt="" /></button>;
  return (
    <div className="minimap panel" data-testid="minimap">
      <canvas ref={ref} width={W * 2} height={H * 2} style={{ width: W, height: H }} onClick={(e) => {
        const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const t = screenToTile((e.clientX - r.left) / s, (e.clientY - r.top) / s);
        if (t.tx >= 0 && t.ty >= 0 && t.tx < MAP_W && t.ty < MAP_H) bus.emit('focus', { x: t.tx, y: t.ty });
      }} />
      <button className="mini-close" onClick={toggle} aria-label="Esconder mapa">−</button>
    </div>
  );
}

export function Hud({ me, onOpen, panelOpen, panel }: { me: Me; onOpen: (p: PanelId) => void; panelOpen: boolean; panel?: PanelId | null }) {
  const s = useFarm();
  useTicker(1000);
  useSound();
  const [ctx, setCtx] = useState<{ label: string; icon: string } | null>(null);
  const [talk, setTalk] = useState(false);
  const [questOpen, setQuestOpen] = useState(() => window.innerWidth > 720);
  const [modal, setModal] = useState<{ kind: 'level'; lv: number } | { kind: 'region'; id: string } | null>(null);
  const [gain, setGain] = useState<{ n: number; k: number } | null>(null);
  useEffect(() => bus.on('context', (l: { label: string; icon: string } | null) => setCtx(l)), []);
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

  const claim = async () => {
    const r = await store.act({ t: 'quest' });
    if (r.ok) { play('coin'); bus.emit('toast', { kind: 'ok', text: `Missão cumprida: ${quest.title}! +${quest.coins} moedas`, icon: 'ui_coins' }); }
    else bus.emit('toast', { kind: 'warn', text: errorText(r.e) });
  };

  return (
    <>
      <div className="hud-top">
        <button className="plate" onClick={() => onOpen('progress')} aria-label={`Nível ${f.level}, ver progressão`} style={{ ['--p' as string]: `${pct * 360}deg` }} data-testid="hud-level">
          <span className="plate-lv"><small>nível</small>{f.level}</span>
        </button>
        <div className="nameplate">
          <span className="ribbon">{f.name}</span>
          <div className="pills">
            <span className="pill pill-coin" data-testid="hud-coins">
              <img src={iconUrl('coin', 64)} alt="" /><b>{fmt(coins)}</b>
              {gain && <em key={gain.k} className={gain.n > 0 ? 'gain up' : 'gain down'}>{gain.n > 0 ? '+' : ''}{fmt(gain.n)}</em>}
            </span>
            <span className="pill" title="Reputação"><img src={iconUrl('star', 64)} alt="" /><b>{f.reputation}</b></span>
            <button className={`pill pill-btn${used >= cap ? ' full' : ''}`} onClick={() => onOpen('inventory')} title="Ocupação do celeiro"><img src={iconUrl('ui_barn', 64)} alt="" /><b>{used}/{cap}</b></button>
          </div>
          <div className="xp"><span style={{ width: `${pct * 100}%` }} /><small>{need ? `${fmt(f.xp)} / ${fmt(need)} XP` : 'Nível máximo'}</small></div>
        </div>
      </div>

      <div className="hud-right">
        <div className="hud-row-r">
          <div className="players" aria-label="Membros da fazenda">
            {s.members.map((m) => (
              <div key={m.user_id} className={`pl${s.online.has(m.user_id) ? ' on' : ''}`} title={`${m.username}${s.online.has(m.user_id) ? ' (online)' : ' (offline)'}`}>
                <Portrait look={normalizeLook(m.user_id === me.id ? me.look : m.look)} scale={0.42} className="pl-face" />
                <i className="pl-dot" />
              </div>
            ))}
            <span className={`net${s.connected ? ' ok' : ''}`} title={s.connected ? 'Conectado em tempo real' : 'Reconectando…'} data-testid="net-status">{s.connected ? 'online' : 'reconectando'}</span>
          </div>
          <button className={`round-btn${sound.musicOn ? '' : ' off'}`} onClick={() => { sound.unlock(); sound.setMusicOn(!sound.musicOn); }} aria-label={sound.musicOn ? 'Desligar música' : 'Ligar música'} aria-pressed={sound.musicOn}><img src={iconUrl('ui_music', 64)} alt="" /></button>
          <button className="round-btn" onClick={() => setTalk(!talk)} aria-label="Falar com o grupo"><img src={iconUrl('ui_chat', 64)} alt="" /></button>
          <button className="round-btn" onClick={() => onOpen('settings')} aria-label="Ajustes"><img src={iconUrl('ui_gear', 64)} alt="" /></button>
        </div>
        {talk && (
          <div className="talk panel">
            {['Olá!', 'Me ajuda aqui!', 'Vou colher', 'Vou produzir', 'Valeu!'].map((t) => (
              <button key={t} className="chip" onClick={() => { bus.emit('emote', t); setTalk(false); }}>{t}</button>
            ))}
          </div>
        )}
        {!panelOpen && <Minimap />}
      </div>

      {!panelOpen && quest && (questOpen ? (
        <div className={`quest panel${done ? ' quest-done' : ''}`} data-testid="quest-card">
          <button className="quest-fold" onClick={() => setQuestOpen(false)} aria-label="Recolher missão">−</button>
          <div className="quest-main">
            <Medal {...gi} size={52} tone={done ? 'folha' : 'esm'} />
            <div className="quest-text">
              <span className="quest-n">Missão {qi + 1} de {QUESTS.length}</span>
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
            <Medal {...gi} size={34} tone={done ? 'folha' : 'esm'} />
            <span>{done ? 'Missão cumprida!' : `${quest.title} ${qv}/${qn}`}</span>
          </button>
          {done && <button className="btn btn-primary btn-sm glow" onClick={claim} data-testid="quest-claim">Receber</button>}
        </div>
      ))}

      <div className="hud-bottom">
        <nav className="dock" aria-label="Menus">
          {DOCK.map(([id, label, icon]) => {
            const badge = id === 'projects' ? projs : id === 'orders' ? deliverable : 0;
            return (
              <button key={id} className={`dock-btn${panel === id ? ' on' : ''}`} onClick={() => onOpen(id as PanelId)} data-testid={`dock-${id}`}>
                <span className="dock-ico"><img src={iconUrl(icon, 96)} alt="" /></span>
                <span className="dock-label">{label}</span>
                {badge > 0 && <em className="badge">{badge}</em>}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="hud-actions">
        <div className="zoom">
          <button className="round-btn sm" onClick={() => bus.emit('zoom', 1.15)} aria-label="Aproximar">+</button>
          <button className="round-btn sm" onClick={() => bus.emit('zoom', 0.87)} aria-label="Afastar">−</button>
          <button className="round-btn sm" onClick={() => bus.emit('recenter')} aria-label="Centralizar no personagem">
            <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="4" fill="currentColor" /><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
        </div>
        {ctx && (
          <button className="ctx-btn" onClick={() => bus.emit('context:do')} data-testid="ctx-btn">
            <span className="ctx-ico">{ctx.icon.startsWith('b:') ? <img src={buildingPortrait(ctx.icon.slice(2), 96)} alt="" /> : <ItemIcon id={ctx.icon} size={30} />}</span>
            <span className="ctx-label">{ctx.label}</span><kbd>E</kbd>
          </button>
        )}
      </div>

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
