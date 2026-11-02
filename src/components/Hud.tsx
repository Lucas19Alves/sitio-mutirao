import { useState, useEffect } from 'react';
import { QUESTS, MAX_LEVEL, ITEM_BY_ID, type QuestGoal } from '../data/catalog.ts';
import { useFarm, useTicker } from '../hooks/useStore.ts';
import { bus, type PanelId } from '../game/bus.ts';
import { capacity, xpNeed, unlocksAt } from '../game/rules.ts';
import { Coins } from './ui.tsx';
import { Portrait } from './FarmsScreen.tsx';
import { normalizeLook } from '../game/art/characters.ts';
import { store } from '../game/state/store.ts';
import { errorText } from '../utils/errors.ts';
import { play } from '../game/audio.ts';
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

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ICONS = {
  inventory: 'M5 8h14l-1.5 11a2 2 0 0 1-2 1.7H8.5a2 2 0 0 1-2-1.7L5 8Zm3 0V6a4 4 0 0 1 8 0v2',
  sell: 'M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3S9.5 10.5 12 11s4.5 1.3 4.5 3.2S14.5 17.5 12 17.5s-4.5-1.3-4.5-3',
  projects: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6',
  orders: 'M7 3h10v18l-5-3-5 3V3Zm3 5h4m-4 4h4',
  tools: 'M14.5 5.5l4 4M4 20l8.5-8.5m2-8 6 6-2.5 2.5-6-6L14.5 3.5Z',
  progress: 'M4 19V9m6 10V5m6 14v-7m4 7H2',
};

export function Hud({ me, onOpen, panelOpen }: { me: Me; onOpen: (p: PanelId) => void; panelOpen: boolean }) {
  const s = useFarm();
  useTicker(1000);
  const [ctx, setCtx] = useState('');
  const [talk, setTalk] = useState(false);
  useEffect(() => bus.on('context', (l: string) => setCtx(l)), []);
  const f = s.farm!;
  const need = xpNeed(f.level);
  const pct = need ? f.xp / need : 1;
  const qi = f.progression.quest;
  const quest = QUESTS[qi];
  const [qv, qn] = quest ? goalProgress(quest.goal) : [0, 1];
  const done = quest && qv >= qn;
  const used = s.invTotal(), cap = capacity();
  const nextLv = Math.min(MAX_LEVEL, f.level + 1);
  const nu = unlocksAt(nextLv);
  const nextNames = [...nu.buildings.map((b) => b.name), ...nu.regions.map((r) => r.name), ...nu.crops.map((c) => ITEM_BY_ID[c.id].name), ...nu.recipes.map((r) => ITEM_BY_ID[r.id].name)].slice(0, 3);
  const deliverable = Object.values(s.orders).filter((o) => o.slot < 99 && Object.entries(o.items).every(([k, q]) => s.qty(k) >= q)).length;
  const projs = s.projects().length;

  const claim = async () => {
    const r = await store.act({ t: 'quest' });
    if (r.ok) { play('coin'); bus.emit('toast', { kind: 'ok', text: `Missão cumprida: ${quest.title}! +${quest.coins} moedas` }); }
    else bus.emit('toast', { kind: 'warn', text: errorText(r.e) });
  };

  return (
    <>
      <div className="hud-top">
        <button className="plate" onClick={() => onOpen('progress')} aria-label={`Nível ${f.level}, ver progressão`} style={{ ['--p' as string]: `${pct * 360}deg` }} data-testid="hud-level">
          <span className="plate-lv">{f.level}</span>
        </button>
        <div className="hud-stats">
          <span className="hud-farm">{f.name}</span>
          <div className="hud-row">
            <span data-testid="hud-coins"><Coins n={f.coins} /></span>
            <span className="rep" title="Reputação">★ {f.reputation}</span>
            <button className={`store-chip${used >= cap ? ' full' : ''}`} onClick={() => onOpen('inventory')} title="Ocupação do celeiro">{used}/{cap}</button>
          </div>
          <span className="xp-text">{need ? `${f.xp}/${need} XP` : 'Nível máximo'}</span>
        </div>
      </div>

      <div className="hud-right">
        <div className="players" aria-label="Membros da fazenda">
          {s.members.map((m) => (
            <div key={m.user_id} className={`pl${s.online.has(m.user_id) ? ' on' : ''}`} title={`${m.username}${s.online.has(m.user_id) ? ' (online)' : ' (offline)'}`}>
              <Portrait look={normalizeLook(m.user_id === me.id ? me.look : m.look)} scale={0.42} className="pl-face" />
              <span className="pl-name">{m.username}</span>
            </div>
          ))}
        </div>
        <span className={`net${s.connected ? ' ok' : ''}`} title={s.connected ? 'Conectado em tempo real' : 'Reconectando…'} data-testid="net-status">{s.connected ? 'online' : 'reconectando'}</span>
        <div className="hud-btns">
          <button className="icon-btn" onClick={() => setTalk(!talk)} aria-label="Falar com o grupo">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 5h16v10H9l-5 4V5Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /></svg>
          </button>
          <button className="icon-btn" onClick={() => onOpen('settings')} aria-label="Ajustes">
            <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2-2.1 2.1m-10 10-2.1 2.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </div>
        {talk && (
          <div className="talk panel">
            {['Olá!', 'Me ajuda aqui!', 'Vou colher', 'Vou produzir', 'Valeu!'].map((t) => (
              <button key={t} className="chip" onClick={() => { bus.emit('emote', t); setTalk(false); }}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {!panelOpen && quest && (
        <div className={`quest panel${done ? ' quest-done' : ''}`} data-testid="quest-card">
          <div className="quest-head"><span className="quest-n">Missão {qi + 1}</span><strong>{quest.title}</strong></div>
          <p>{quest.desc}</p>
          <div className="quest-foot">
            <div className="bar bar-folha"><span style={{ width: `${(qv / qn) * 100}%` }} /></div>
            <span className="quest-count">{qv}/{qn}</span>
            {done && <button className="btn btn-primary btn-sm" onClick={claim} data-testid="quest-claim">Receber {quest.coins}</button>}
          </div>
          {nextNames.length > 0 && <p className="next-unlock">Nível {nextLv} libera: {nextNames.join(', ')}</p>}
        </div>
      )}

      <div className="hud-bottom">
        <nav className="dock" aria-label="Menus">
          {([['inventory', 'Estoque', 0], ['sell', 'Vender', 0], ['projects', 'Projetos', projs], ['orders', 'Pedidos', deliverable], ['tools', 'Ferramentas', 0], ['progress', 'Progresso', 0]] as const).map(([id, label, badge]) => (
            <button key={id} className="dock-btn" onClick={() => onOpen(id)} data-testid={`dock-${id}`}>
              <Icon d={ICONS[id]} />
              <span>{label}</span>
              {badge > 0 && <em className="badge">{badge}</em>}
            </button>
          ))}
        </nav>
      </div>

      <div className="hud-actions">
        <div className="zoom">
          <button className="icon-btn" onClick={() => bus.emit('zoom', 1.15)} aria-label="Aproximar">+</button>
          <button className="icon-btn" onClick={() => bus.emit('zoom', 0.87)} aria-label="Afastar">−</button>
          <button className="icon-btn" onClick={() => bus.emit('recenter')} aria-label="Centralizar no personagem">
            <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="4" fill="currentColor" /><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
          </button>
        </div>
        {ctx && <button className="ctx-btn" onClick={() => bus.emit('context:do')} data-testid="ctx-btn"><span>{ctx}</span><kbd>E</kbd></button>}
      </div>
    </>
  );
}
