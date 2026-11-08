// Painéis da progressão: missões, central da fazenda, loja (pets, melhorias, visual),
// personagem, campos especializados e obstáculos físicos.
import { useEffect, useState } from 'react';
import {
  FIELDS, FIELD_BY_ID, OBSTACLE_BY_ID, PETS, PERKS, COSMETICS, ITEM_BY_ID, CROP_BY_ID, CONFIG, MAIN,
  ABILITY_TEXT, PET_LEVELS, petLevel, rushCost, FIELD_SPEED, FIELD_YIELD, fieldPlots, type MainMission,
} from '../../data/catalog.ts';
import { useFarm, useTicker } from '../../hooks/useStore.ts';
import { store, type GenMission } from '../../game/state/store.ts';
import { bus, type PanelId } from '../../game/bus.ts';
import { canAfford, level, growMs, fieldInfo, obstacleInfo, entityKeyFor } from '../../game/rules.ts';
import { mainsOpen, goalProgress, goalIcon, goalTarget, genTitle, genProgress } from '../../game/missions.ts';
import { Sheet, Btn, Bar, Medal, CostList, Coins, Section, ItemIcon, toast } from '../ui.tsx';
import { act } from './Panels.tsx';
import { ActiveProject, give } from './Projects.tsx';
import { Portrait } from '../FarmsScreen.tsx';
import { normalizeLook } from '../../game/art/characters.ts';
import { buildingPortrait, useThumbs } from '../../game/art/portraits.ts';
import { iconUrl } from '../../game/art/icons.ts';
import { fmt, fmtTime } from '../../utils/format.ts';
import { play } from '../../game/audio.ts';
import type { Me } from '../../App.tsx';

const Cr = ({ n }: { n: number }) => <span className="cr-chip">💎 {fmt(n)}</span>;
const go = (t: Parameters<typeof bus.emit>[1], close?: () => void) => { bus.emit('goto', t); close?.(); };

function Rewards({ coins, xp, cr }: { coins: number; xp: number; cr?: number }) {
  return (
    <div className="m-rew">
      {coins > 0 && <span className="chip-r"><img src={iconUrl('coin', 64)} alt="" />{fmt(coins)}</span>}
      {xp > 0 && <span className="chip-r"><img src={iconUrl('ui_xp', 64)} alt="" />{fmt(xp)} XP</span>}
      {!!cr && <span className="chip-r cr">💎 {cr}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- missões
function MainCard({ m, first, onClose }: { m: MainMission; first: boolean; onClose: () => void }) {
  useThumbs();
  const [v, n] = goalProgress(m.goal);
  const done = v >= n;
  const gi = goalIcon(m.goal);
  const t = goalTarget(m.goal);
  const claim = async () => {
    const r = await act({ t: 'main', m: m.id });
    if (r.ok) { play('mission'); bus.emit('cheer'); toast(`Missão concluída: ${m.title}!${m.r.cr ? ` +${m.r.cr} 💎` : ''}`, 'ok'); }
  };
  return (
    <li className={`mission panel${first ? ' main' : ''}${done ? ' done' : ''}`} data-testid={`main-${m.id}`}>
      <div className="row">
        <Medal icon={gi.icon} src={gi.building ? buildingPortrait(gi.building, 96) : undefined} size={first ? 52 : 42} tone={done ? 'folha' : 'esm'} />
        <div className="grow">
          <span className="m-kicker">{first ? 'Missão principal' : 'Também disponível'}</span>
          <strong>{m.title}</strong>
          <p className="muted small">{m.desc}</p>
        </div>
      </div>
      <div className="row"><Bar value={v} max={n} tone={done ? 'folha' : 'ipe'} /><span className="small">{v}/{n}</span></div>
      <div className="row between wrap">
        <Rewards coins={m.r.coins} xp={m.r.xp} cr={m.r.cr} />
        {done ? <Btn small onClick={claim} testid={`claim-${m.id}`}>Receber</Btn> : t && <Btn small kind="ghost" onClick={() => go(t, onClose)}>Ir até lá</Btn>}
      </div>
      {m.unlocks && <p className="next-unlock"><img src={iconUrl('ui_lock', 64)} alt="" />Libera: {m.unlocks}</p>}
    </li>
  );
}

function GenCard({ m, s, i, label }: { m: GenMission; s: 'side' | 'daily' | 'coop'; i: number; label: string }) {
  const [v, n] = genProgress(m);
  const done = v >= n;
  const gi = goalIcon({ k: 'gen', key: m.k });
  const claim = async () => {
    const r = await act({ t: 'mclaim', s, i });
    if (r.ok) { play('coin'); toast(`${label} concluída! +${fmt(m.r.coins)} moedas${m.r.cr ? `, +${m.r.cr} 💎` : ''}`, 'ok'); }
  };
  return (
    <li className={`mission panel${m.done ? ' claimed' : done ? ' done' : ''}`} data-testid={`gen-${s}-${i}`}>
      <div className="row"><Medal icon={gi.icon} size={38} tone={done ? 'folha' : 'esm'} /><div className="grow"><span className="m-kicker">{label}</span><strong>{genTitle(m)}</strong></div></div>
      <div className="row"><Bar value={v} max={n} tone={done ? 'folha' : 'ipe'} /><span className="small">{v}/{n}</span></div>
      <div className="row between wrap">
        <Rewards coins={m.r.coins} xp={m.r.xp} cr={m.r.cr} />
        {m.done ? <span className="note small">Recebida hoje</span> : done && <Btn small onClick={claim}>Receber</Btn>}
      </div>
    </li>
  );
}

export function MissionsPanel({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  useEffect(() => { void store.act({ t: 'mref' }); }, []);
  const mains = mainsOpen();
  const ms = s.farm!.progression.ms ?? {};
  const doneN = s.farm!.progression.mdone?.length ?? 0;
  const ready = mains.filter((m) => { const [v, n] = goalProgress(m.goal); return v >= n; });
  // fazendas antigas já cumpriram muitas etapas: recebe tudo o que estiver pronto, em cadeia
  const claimAll = async () => {
    let got = 0, coins = 0, cr = 0;
    for (let guard = 0; guard < 45; guard++) {
      const next = mainsOpen().find((m) => { const [v, n] = goalProgress(m.goal); return v >= n; });
      if (!next) break;
      const r = await store.act({ t: 'main', m: next.id });
      if (!r.ok) break;
      got++; coins += next.r.coins; cr += next.r.cr ?? 0;
    }
    if (got) { play('level'); bus.emit('cheer'); toast(`${got} missões recebidas: +${fmt(coins)} moedas${cr ? `, +${cr} 💎` : ''}`, 'ok'); }
  };
  return (
    <Sheet title="Missões" subtitle={`Campanha ${doneN}/${MAIN.length} · as tarefas mudam com o que a fazenda já tem`} icon="ui_scroll" onClose={onClose}>
      {ready.length > 1 && <Btn onClick={claimAll} testid="claim-all">Receber todas as prontas ({ready.length}+)</Btn>}
      <ul className="list">{mains.slice(0, 3).map((m, i) => <MainCard key={m.id} m={m} first={i === 0} onClose={onClose} />)}</ul>
      {mains.length === 0 && <p className="note">Campanha completa! Continue com as missões do dia.</p>}
      {(ms.side?.length ?? 0) > 0 && (
        <Section title="Secundárias">
          <ul className="list">{ms.side!.map((m, i) => m && <GenCard key={`${m.k}${i}`} m={m} s="side" i={i} label="Secundária" />)}</ul>
        </Section>
      )}
      {ms.daily && (
        <Section title="Diárias" aside={<span className="small muted">renovam à meia-noite</span>}>
          <ul className="list">{ms.daily.l.map((m, i) => <GenCard key={`${m.k}${i}`} m={m} s="daily" i={i} label="Diária" />)}</ul>
        </Section>
      )}
      {ms.coop && (
        <Section title="Cooperativa" aside={<span className="small muted">conta o trabalho de todos</span>}>
          <ul className="list"><GenCard m={ms.coop} s="coop" i={0} label="Cooperativa" /></ul>
        </Section>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- central da fazenda
const HUB: { id: PanelId; label: string; icon: string; cat: string }[] = [
  { id: 'team', label: 'Equipe', icon: 'ui_people', cat: 'sky' },
  { id: 'fair', label: 'Feira', icon: 'ui_coins', cat: 'gold' },
  { id: 'inventory', label: 'Estoque', icon: 'ui_barn', cat: 'leaf' },
  { id: 'orders', label: 'Balcão', icon: 'ui_scroll', cat: 'sky' },
  { id: 'sell', label: 'Mercado', icon: 'ui_coins', cat: 'gold' },
  { id: 'projects', label: 'Obras', icon: 'ui_build', cat: 'wood' },
  { id: 'fields', label: 'Campos', icon: 'wheat', cat: 'leaf' },
  { id: 'tools', label: 'Ferramentas', icon: 'ui_tools', cat: 'steel' },
  { id: 'progress', label: 'Progresso', icon: 'ui_progress', cat: 'grape' },
  { id: 'settings', label: 'Ajustes', icon: 'ui_gear', cat: 'steel' },
];
export function FarmHub({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  const f = s.farm!;
  const projs = s.projects().length;
  return (
    <Sheet title={f.name} subtitle={`Nível ${f.level} · ${s.members.length} ${s.members.length === 1 ? 'membro' : 'membros'} · ★ ${f.reputation}`} icon="ui_barn" onClose={onClose}>
      <div className="hub-grid">
        {HUB.map((h) => (
          <button key={String(h.id)} className={`hub-tile cat-${h.cat}`} onClick={() => bus.emit('panel', h.id)} data-testid={`hub-${String(h.id)}`}>
            <img src={iconUrl(h.icon, 96)} alt="" /><span>{h.label}</span>
            {h.id === 'projects' && projs > 0 && <em className="badge">{projs}</em>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- campos
export function FieldsPanel({ onClose }: { onClose: () => void }) {
  useFarm();
  return (
    <Sheet title="Campos" subtitle="Cada campo planta a sua cultura sozinho" icon="wheat" onClose={onClose}>
      <ul className="list">
        {FIELDS.map((fd) => {
          const fi = fieldInfo(fd);
          return (
            <li key={fd.id} className={`panel field-row${fi.lv ? '' : ' locked'}`}>
              <div className="row"><Medal icon={fd.crops[0]} size={44} tone={fi.lv ? 'folha' : 'esm'} /><div className="grow"><strong>{fd.name}</strong><span className="muted small">{fi.lv ? `nível ${fi.lv} · ${fi.plots} canteiros` : fi.lock ?? 'pronto para abrir'}</span></div>
                <Btn small kind="ghost" onClick={() => go({ kind: 'field', f: fd.id }, onClose)}>Ir</Btn></div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export function FieldPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useFarm();
  useTicker(1000);
  const fd = FIELD_BY_ID[id];
  const fi = fieldInfo(fd);
  const now = s.now();
  const slots = s.ents[fi.e]?.state.p ?? [];
  const [seed, setSeed] = useState<string>(() => { try { return localStorage.getItem(`sm-fseed-${id}`) ?? fd.crops[0]; } catch { return fd.crops[0]; } });
  useEffect(() => { bus.emit('fieldseed', { f: id, c: seed }); try { localStorage.setItem(`sm-fseed-${id}`, seed); } catch { /* */ } }, [id, seed]);
  const openOrUp = async () => {
    const r = await act(fi.lv ? { t: 'fup', f: id } : { t: 'fopen', f: id });
    if (r.ok) { play('build'); bus.emit('cheer'); toast(fi.lv ? `${fd.name} agora no nível ${fi.lv + 1}!` : `${fd.name} aberto! Ande pelos canteiros para plantar.`, 'ok'); }
  };
  const growing = slots.map((p, i) => (p ? { i, c: p[0], left: p[1] + growMs(p[0], fi.e) - now } : null)).filter((x): x is { i: number; c: string; left: number } => !!x && x.left > 0);
  const rush = async (i: number) => { const r = await act({ t: 'rush', k: 'plot', e: fi.e, i }); if (r.ok) play('pop'); };
  const nextLv = fi.lv + 1;
  return (
    <Sheet title={fd.name} subtitle={fi.lv ? `Nível ${fi.lv} de 3 · ${fi.plots} canteiros` : 'Campo fechado'} icon={fd.crops[0]} onClose={onClose}>
      <div className="field-stats">
        {fd.crops.map((c) => <span key={c} className="chip-r"><ItemIcon id={c} size={22} />{ITEM_BY_ID[c].name} · {fmtTime(growMs(c, fi.e))}</span>)}
        {fi.lv > 0 && <span className="chip-r">Velocidade {Math.round((1 / FIELD_SPEED[fi.lv - 1]) * 100)}%</span>}
        {fi.lv > 0 && FIELD_YIELD[fi.lv - 1] > 0 && <span className="chip-r">+{FIELD_YIELD[fi.lv - 1]} por colheita</span>}
      </div>
      {fd.crops.length > 1 && fi.lv > 0 && (
        <Section title="O que plantar aqui">
          <div className="opt-row">{fd.crops.map((c) => {
            const lock = CROP_BY_ID[c].level > level();
            return <button key={c} className={`chip${seed === c ? ' on' : ''}`} disabled={lock} onClick={() => setSeed(c)}><ItemIcon id={c} size={18} /> {ITEM_BY_ID[c].name}{lock ? ` (nível ${CROP_BY_ID[c].level})` : ''}</button>;
          })}</div>
        </Section>
      )}
      {fi.next ? (
        <section className="panel inset">
          <h3 className="sub">{fi.lv ? `Melhorar para o nível ${nextLv}` : 'Abrir o campo'}</h3>
          <p className="muted small">{fi.lv ? `Nível ${nextLv}: ${fieldPlots(fd, nextLv)} canteiros, cresce ${Math.round((1 - FIELD_SPEED[nextLv - 1]) * 100)}% mais rápido${FIELD_YIELD[nextLv - 1] ? ', +1 por colheita' : ''}.` : `Começa com ${fieldPlots(fd, 1)} canteiros. O plantio e a colheita acontecem ao andar por eles.`}</p>
          <CostList cost={fi.next} />
          <Btn disabled={!!fi.lock || !canAfford(fi.next)} onClick={openOrUp} testid={`field-${fi.lv ? 'up' : 'open'}-${id}`}>{fi.lock ?? (canAfford(fi.next) ? (fi.lv ? 'Melhorar' : 'Abrir campo') : 'Faltam materiais')}</Btn>
        </section>
      ) : <p className="note">Campo no nível máximo.</p>}
      {growing.length > 0 && (
        <Section title="Crescendo agora">
          <ul className="list compact">
            {growing.map((g) => {
              const cost = rushCost(g.left);
              return (
                <li key={g.i} className="row between">
                  <span className="row"><ItemIcon id={g.c} size={24} /> Canteiro {g.i + 1} · {fmtTime(g.left)}</span>
                  <Btn small kind="quiet" disabled={cost.cr ? s.crystals() < cost.cr : (s.farm!.coins < (cost.coins ?? 0))} onClick={() => rush(g.i)}>Acelerar {cost.cr ? `💎${cost.cr}` : `🪙${cost.coins}`}</Btn>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- obstáculos
export function ObstaclePanel({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useFarm();
  const o = OBSTACLE_BY_ID[id];
  const info = obstacleInfo(o);
  const p = s.ents[entityKeyFor(info.k)]?.state.proj;
  const start = async () => {
    const first = (info.cost.coins ?? 0) > 0 && s.farm!.coins > 0 ? ['coins', Math.min(info.cost.coins!, s.farm!.coins)] as const
      : Object.entries(info.cost.items ?? {}).map(([k, q]) => [k, Math.min(q, s.qty(k))] as const).find(([, q]) => q > 0);
    if (!first) { toast('Junte pelo menos um dos materiais para começar a obra.', 'info'); return; }
    await give(info.k, first[0], first[1]);
  };
  const reqs: [string, boolean][] = [
    [`Nível ${info.lvReq} da fazenda`, level() >= info.lvReq],
    ...(info.tool ? [[`Ferramenta: ${info.tool.name}`, !!o.tool && s.tool(o.tool.t) >= o.tool.tier] as [string, boolean]] : []),
    ...(info.needs ? [[`Prédio: ${info.needs}`, s.lvl(info.needs) >= 1] as [string, boolean]] : []),
  ];
  if (info.cleared) return <Sheet title={o.name} icon="ui_map" onClose={onClose}><p className="note">Caminho livre! Esta passagem já foi aberta.</p></Sheet>;
  return (
    <Sheet title={o.name} subtitle={info.name ? `Bloqueia o acesso a ${info.name}` : 'Acesso à margem sul do rio'} icon="ui_map" onClose={onClose}>
      <p>{o.desc}</p>
      <ul className="reqs">{reqs.map(([t, ok]) => <li key={t} className={ok ? 'ok' : 'miss'}>{ok ? '✔' : '✖'} {t.replace(/^Prédio: (.*)$/, (_, b) => `Prédio: ${b}`)}</li>)}</ul>
      {p ? <ul className="list"><ActiveProject p={p} highlight={false} /></ul> : (
        <section className="panel inset">
          <h3 className="sub">Materiais da obra</h3>
          <p className="muted small">Qualquer membro entrega parte, a qualquer hora. A obra fica salva.</p>
          <CostList cost={info.cost} />
          <Btn disabled={!!info.lock} onClick={start} testid={`obs-start-${id}`}>{info.lock ?? 'Começar a obra'}</Btn>
        </section>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- loja
export function ShopPanel({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  const [tab, setTab] = useState<'pets' | 'perks' | 'look'>('pets');
  const lv = level();
  const cr = s.crystals();
  const pets = s.pets();
  const buyPet = async (id: string) => { const r = await act({ t: 'pet', p: id }); if (r.ok) { play('pet'); play('sparkle'); bus.emit('cheer'); toast('Novo amigo na fazenda!', 'ok'); } };
  const perk = async (id: string) => { const r = await act({ t: 'perk', p: id }); if (r.ok) { play('build'); toast('Melhoria comprada!', 'ok'); } };
  const cosm = async (id: string) => { const r = await act({ t: 'cosm', c: id }); if (r.ok) { play('coin'); toast('Item de visual liberado! Troque no ateliê da Casa da Fazenda.', 'ok'); } };
  const priceOk = (p: { coins?: number; cr?: number }) => s.farm!.coins >= (p.coins ?? 0) && cr >= (p.cr ?? 0);
  const Price = ({ p }: { p: { coins?: number; cr?: number } }) => <>{p.coins ? <Coins n={p.coins} size={16} /> : null}{p.cr ? <Cr n={p.cr} /> : null}</>;
  return (
    <Sheet title="Loja" subtitle={`Moedas do caixa da fazenda · 💎 ${cr} cristais`} icon="ui_coins" onClose={onClose}>
      <div className="tabs">
        <button className={tab === 'pets' ? 'on' : ''} onClick={() => setTab('pets')}>Pets</button>
        <button className={tab === 'perks' ? 'on' : ''} onClick={() => setTab('perks')}>Melhorias</button>
        <button className={tab === 'look' ? 'on' : ''} onClick={() => setTab('look')}>Visual</button>
      </div>
      {tab === 'pets' && (
        <ul className="shop-grid">
          {PETS.map((p) => {
            const own = pets.own[p.id];
            const lock = lv < p.level ? `Nível ${p.level}` : null;
            const plv = own ? petLevel(own.xp) : 1;
            return (
              <li key={p.id} className={`shop-card panel rar-${p.rarity}${own ? ' owned' : ''}`} data-testid={`pet-${p.id}`}>
                <span className="rar">{p.rarity}</span>
                <strong>{p.name}</strong><span className="muted small">{p.species}</span>
                <p className="small">{ABILITY_TEXT[p.ability](p.values[plv - 1])}</p>
                <p className="muted small"><em>{p.persona}</em></p>
                {own ? (
                  pets.eq === p.id ? <span className="note small">Acompanhando você</span> : <Btn small kind="ghost" onClick={() => act({ t: 'peq', p: p.id })}>Levar comigo</Btn>
                ) : (
                  <><div className="row"><Price p={p.price} /></div><Btn small disabled={!!lock || !priceOk(p.price)} onClick={() => buyPet(p.id)}>{lock ?? 'Adotar'}</Btn></>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {tab === 'perks' && (
        <ul className="list">
          {PERKS.map((p) => {
            const cur = s.perk(p.id), nx = p.levels[cur];
            const lock = nx && lv < nx.level ? `Nível ${nx.level}` : null;
            return (
              <li key={p.id} className="panel" data-testid={`perk-${p.id}`}>
                <div className="row"><Medal icon={p.id === 'spd' ? 'ui_map' : 'ui_tools'} size={44} tone={cur ? 'folha' : 'esm'} /><div className="grow"><strong>{p.name}</strong><span className="muted small">{p.desc} · +{Math.round(p.per * 100 * cur)}% agora</span></div></div>
                <div className="pips">{p.levels.map((_, i) => <span key={i} className={i < cur ? 'on' : ''} />)}</div>
                {nx ? <div className="row between"><Coins n={nx.coins} size={16} /><Btn small disabled={!!lock || s.farm!.coins < nx.coins} onClick={() => perk(p.id)}>{lock ?? `Comprar +${Math.round(p.per * 100)}%`}</Btn></div> : <p className="note small">No máximo.</p>}
              </li>
            );
          })}
          <li className="panel"><div className="row"><Medal icon="ui_bag" size={44} /><div className="grow"><strong>Mochila</strong><span className="muted small">{s.bagCap()} itens. Melhore na Casa da Fazenda.</span></div><Btn small kind="ghost" onClick={() => go({ kind: 'building', id: 'farmhouse' }, onClose)}>Ir</Btn></div></li>
          <li className="panel"><div className="row"><Medal icon="ui_tools" size={44} /><div className="grow"><strong>Ferramentas</strong><span className="muted small">Machado, picareta, foice e pá até o nível 5.</span></div><Btn small kind="ghost" onClick={() => bus.emit('panel', 'tools')}>Abrir</Btn></div></li>
        </ul>
      )}
      {tab === 'look' && (
        <>
          <p className="muted small">A maior parte do visual é livre. Estes itens precisam ser liberados uma vez e ficam na sua conta. Para vestir, vá ao ateliê da Casa da Fazenda.</p>
          <ul className="shop-grid">
            {COSMETICS.map((c) => {
              const own = s.owned(c.id), lock = lv < c.level ? `Nível ${c.level}` : null;
              return (
                <li key={c.id} className={`shop-card panel${own ? ' owned' : ''}`}>
                  <strong>{c.name}</strong>
                  {own ? <span className="note small">Liberado</span> : <><div className="row"><Price p={c.price} /></div><Btn small disabled={!!lock || !priceOk(c.price)} onClick={() => cosm(c.id)}>{lock ?? 'Liberar'}</Btn></>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="hint">💎 Cristais vêm de missões principais, diárias e cooperativas, clientes especiais, novos níveis e regiões. Não existe compra com dinheiro real.</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- personagem
export function MePanel({ me, onClose }: { me: Me; onClose: () => void }) {
  const s = useFarm();
  const m = s.me();
  const pets = s.pets();
  return (
    <Sheet title={me.username} subtitle="Seu personagem, seus pets e suas melhorias" icon="ui_people" onClose={onClose}>
      <div className="me-head panel inset">
        <Portrait look={normalizeLook(me.look)} scale={0.9} className="me-face" />
        <div className="grow">
          <div className="me-stats">
            <span>🥾 Velocidade +{Math.round(7 * s.perk('spd'))}%</span>
            <span>🧤 Trabalho +{Math.round(15 * s.perk('gat'))}%</span>
            <span>🎒 Mochila {s.bagCap()}</span>
            <span>🌾 {fmt(m?.stats.harvest ?? 0)} coletados</span>
          </div>
          <Btn small kind="ghost" onClick={() => go({ kind: 'building', id: 'farmhouse' }, onClose)}>Trocar visual no ateliê (Casa da Fazenda)</Btn>
        </div>
      </div>
      <Section title={`Coleção de pets (${Object.keys(pets.own).length}/${PETS.length})`}>
        <ul className="pet-grid">
          {PETS.map((p) => {
            const own = pets.own[p.id];
            const plv = own ? petLevel(own.xp) : 0;
            const nxt = PET_LEVELS[plv] ?? null;
            return (
              <li key={p.id} className={`pet-cell rar-${p.rarity}${own ? '' : ' missing'}${pets.eq === p.id ? ' eq' : ''}`}>
                <span className="pet-dot" style={{ background: own ? p.color : '#c9c2b4', borderColor: own ? p.color2 : '#a59e90' }} />
                <strong>{own ? p.name : '???'}</strong>
                <span className="small muted">{own ? `nível ${plv}` : p.rarity}</span>
                {own && nxt !== null && <Bar value={own.xp} max={nxt} tone="folha" />}
                {own && (pets.eq === p.id ? <button className="link small" onClick={() => act({ t: 'peq', p: null })}>Deixar em casa</button> : <button className="link small" onClick={() => act({ t: 'peq', p: p.id })}>Levar</button>)}
              </li>
            );
          })}
        </ul>
        <Btn small kind="ghost" onClick={() => bus.emit('panel', 'shop')}>Ver na loja</Btn>
      </Section>
      <p className="hint">Pets ganham experiência quando você coleta e atende clientes. O bônus é moderado e só vale para quem leva o pet.</p>
      <p className="small muted">Mochila: até {CONFIG.bagCap[CONFIG.bagCap.length - 1]} itens no tamanho máximo.</p>
    </Sheet>
  );
}
