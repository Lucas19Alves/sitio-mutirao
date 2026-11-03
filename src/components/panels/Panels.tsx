import { useMemo, useState } from 'react';
import {
  ITEMS, ITEM_BY_ID, RECIPES, CROPS, TOOLS, BUILDING_BY_ID, REGION_BY_ID, type ItemCat,
} from '../../data/catalog.ts';
import { useFarm } from '../../hooks/useStore.ts';
import { store } from '../../game/state/store.ts';
import { bus, type PanelId } from '../../game/bus.ts';
import { capacity, marketBonus, growMs, plotCount, canAfford, level } from '../../game/rules.ts';
import { Sheet, ItemIcon, Coins, CostList, Btn, Bar, Qty, Medal, Section, toast } from '../ui.tsx';
import { iconUrl } from '../../game/art/icons.ts';
import { errorText } from '../../utils/errors.ts';
import { fmt, fmtTime } from '../../utils/format.ts';
import { play, sound } from '../../game/audio.ts';
import { music } from '../../game/music.ts';
import { changePassword, signOut } from '../../services/auth.ts';
import { supabase } from '../../services/supabase.ts';
import { CharacterEditor } from '../CharacterEditor.tsx';
import { ProjectsPanel } from './Projects.tsx';
import { OrdersPanel } from './Orders.tsx';
import { BuildingPanel } from './Building.tsx';
import { ProgressPanel } from './Progress.tsx';
import type { Me } from '../../App.tsx';
import type { Look } from '../../game/art/characters.ts';

export async function act(a: Parameters<typeof store.act>[0], okText?: string) {
  const r = await store.act(a);
  if (!r.ok) { play('error'); toast(errorText(r.e), 'warn'); }
  else if (okText) toast(okText, 'ok');
  return r;
}

const TOOL_ICON: Record<string, string> = { axe: 'wood', pickaxe: 'stone', sickle: 'wheat', shovel: 'clay' };
const CAT_LABEL: Record<ItemCat, string> = { raw: 'Recursos', fruit: 'Frutas', crop: 'Cultivos', flower: 'Flores', product: 'Materiais', goods: 'Mercadorias' };

export function Panels({ panel, onClose, me, onExit, onLookChange }: { panel: PanelId; onClose: () => void; me: Me; onExit: () => void; onLookChange: (l: Look) => void }) {
  if (typeof panel === 'object' && 'b' in panel) {
    if (panel.b === 'sales_cart') return <SellPanel onClose={onClose} />;
    if (panel.b === 'order_board') return <OrdersPanel onClose={onClose} />;
    if (panel.b === 'barn') return <InventoryPanel onClose={onClose} />;
    return <BuildingPanel id={panel.b} onClose={onClose} />;
  }
  if (typeof panel === 'object' && 'plant' in panel) return <PlantPanel e={panel.plant} i={panel.i} onClose={onClose} />;
  switch (panel) {
    case 'inventory': return <InventoryPanel onClose={onClose} />;
    case 'sell': return <SellPanel onClose={onClose} />;
    case 'projects': return <ProjectsPanel onClose={onClose} />;
    case 'orders': return <OrdersPanel onClose={onClose} />;
    case 'tools': return <ToolsPanel onClose={onClose} />;
    case 'progress': return <ProgressPanel onClose={onClose} />;
    case 'settings': return <SettingsPanel onClose={onClose} me={me} onExit={onExit} onLookChange={onLookChange} />;
    default: return null;
  }
}

// ---------------------------------------------------------------- estoque
function InventoryPanel({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  const [sel, setSel] = useState<string | null>(null);
  const used = s.invTotal(), cap = capacity();
  const groups = useMemo(() => {
    const g: Partial<Record<ItemCat, string[]>> = {};
    for (const it of ITEMS) if (s.qty(it.id) > 0) (g[it.cat] ??= []).push(it.id);
    return g;
  }, [s.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const item = sel ? ITEM_BY_ID[sel] : null;
  const usedIn = sel ? RECIPES.filter((r) => r.in[sel]) : [];
  return (
    <Sheet title="Estoque da fazenda" subtitle="Compartilhado por todos os membros" icon="ui_bag" onClose={onClose}>
      <div className="cap-row"><span>Celeiro {used}/{cap}</span><Bar value={used} max={cap} tone={used >= cap ? 'chita' : 'folha'} /></div>
      <p className="muted small">Tudo aqui é de todos os membros. Melhore o Celeiro ou construa o Armazém para guardar mais.</p>
      {used === 0 && <div className="empty"><img src={iconUrl('ui_bag', 96)} alt="" />Estoque vazio. Corte árvores e colha capim para começar.</div>}
      {Object.entries(groups).map(([cat, ids]) => (
        <Section key={cat} title={CAT_LABEL[cat as ItemCat]} aside={<span className="small muted">{ids!.reduce((a, id) => a + s.qty(id), 0)}</span>}>
          <div className="inv-grid">
            {ids!.map((id) => (
              <button key={id} className={`inv-cell cat-${ITEM_BY_ID[id].cat}${sel === id ? ' on' : ''}`} onClick={() => setSel(sel === id ? null : id)} title={ITEM_BY_ID[id].name} data-testid={`inv-${id}`}>
                <ItemIcon id={id} size={40} /><span>{s.qty(id)}</span>
              </button>
            ))}
          </div>
        </Section>
      ))}
      {item && (
        <div className="inv-detail panel">
          <div className="row"><Medal icon={item.id} size={58} tone="ipe" /><div><strong>{item.name}</strong><p className="muted small">{item.desc ?? CAT_LABEL[item.cat]}</p></div></div>
          <p>Vale <Coins n={Math.floor(item.price * (1 + marketBonus()))} /> cada no mercado.</p>
          {usedIn.length > 0 && <p className="small">Usado em: {usedIn.map((r) => ITEM_BY_ID[r.id].name).join(', ')}</p>}
          <Btn small kind="ghost" onClick={() => bus.emit('panel', 'sell')}>Ir para Vender</Btn>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- vender
function SellPanel({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  const [tab, setTab] = useState<'sell' | 'prices'>('sell');
  const [qty, setQty] = useState<Record<string, number>>({});
  const bonus = marketBonus();
  const stock = ITEMS.filter((i) => s.qty(i.id) > 0).sort((a, b) => b.price * s.qty(b.id) - a.price * s.qty(a.id));
  const lv = level();
  const profit = RECIPES.filter((r) => r.level <= lv).map((r) => {
    const cost = Object.entries(r.in).reduce((a, [k, q]) => a + ITEM_BY_ID[k].price * q, 0);
    const value = ITEM_BY_ID[r.id].price * r.out;
    return { r, cost, value, gain: value - cost, perMin: ((value - cost) / r.time) * 60 };
  }).sort((a, b) => b.perMin - a.perMin);
  const sell = async (id: string, q: number) => {
    const r = await act({ t: 'sell', i: id, q });
    if (r.ok) { play('coin'); toast(`Vendido: ${q}× ${ITEM_BY_ID[id].name} por ${fmt(Number(r.g))} moedas.`, 'ok'); }
  };
  return (
    <Sheet title="Mercado" subtitle="O dinheiro vai para o caixa da fazenda" icon="ui_coins" onClose={onClose}>
      <div className="tabs">
        <button className={tab === 'sell' ? 'on' : ''} onClick={() => setTab('sell')}>Vender</button>
        <button className={tab === 'prices' ? 'on' : ''} onClick={() => setTab('prices')}>Lucratividade</button>
      </div>
      {bonus > 0 && <p className="note">O Mercado está pagando +{Math.round(bonus * 100)}% em tudo.</p>}
      {tab === 'sell' ? (
        stock.length === 0 ? <div className="empty"><img src={iconUrl('ui_coins', 96)} alt="" />Nada para vender ainda. Colete recursos pelo mapa.</div> : (
          <ul className="list">
            {stock.map((it) => {
              const have = s.qty(it.id);
              const q = Math.min(have, qty[it.id] ?? have);
              const unit = it.price * (1 + bonus);
              return (
                <li key={it.id} className="sell-row">
                  <Medal icon={it.id} size={46} />
                  <div className="grow"><strong>{it.name}</strong><span className="muted small">{have} no estoque, {fmt(Math.floor(unit))} cada</span></div>
                  <Qty value={q} max={have} onChange={(n) => setQty({ ...qty, [it.id]: n })} />
                  <Btn small onClick={() => sell(it.id, q)} testid={`sell-${it.id}`}>Vender por {fmt(Math.floor(unit * q))}</Btn>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <>
          <p className="muted small">Lucro de cada produção comparado a vender os ingredientes. Pedidos pagam cerca de 35% a mais que o mercado.</p>
          <table className="profit">
            <thead><tr><th>Produto</th><th>Lucro</th><th>Por minuto</th></tr></thead>
            <tbody>
              {profit.map((p) => (
                <tr key={p.r.id}>
                  <td><ItemIcon id={p.r.id} size={22} /> {ITEM_BY_ID[p.r.id].name}<small>{BUILDING_BY_ID[p.r.b].name}</small></td>
                  <td>{fmt(p.gain)}</td>
                  <td>{p.perMin.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- ferramentas
function ToolsPanel({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  return (
    <Sheet title="Ferramentas" subtitle="Quando alguém fabrica, todos usam" icon="ui_tools" onClose={onClose}>
            <ul className="list">
        {TOOLS.map((t) => {
          const cur = s.tool(t.id);
          const nx = t.tiers[cur];
          const lockedBy = nx && (level() < nx.level ? `Nível ${nx.level}` : nx.needs && s.lvl(nx.needs) < 1 ? `Exige ${BUILDING_BY_ID[nx.needs].name}` : null);
          return (
            <li key={t.id} className="tool-row panel" data-testid={`tool-${t.id}`}>
              <div className="tool-head">
                <Medal icon={TOOL_ICON[t.id]} size={58} tone={cur ? 'ipe' : 'esm'} />
                <div className="grow"><strong>{t.name}</strong><span className="tier">{cur ? t.tiers[cur - 1].name : 'Não possui'}</span><p className="muted small">{t.desc}</p></div>
              </div>
              <div className="pips">{t.tiers.map((x) => <span key={x.tier} className={x.tier <= cur ? 'on' : ''} />)}</div>
              {nx ? (
                <>
                  <p className="small">Próximo: <strong>{nx.name}</strong></p>
                  <CostList cost={nx.cost} />
                  <Btn disabled={!!lockedBy || !canAfford(nx.cost)} onClick={() => act({ t: 'tool', tool: t.id }, `${nx.name} pronta!`).then((r) => r.ok && play('build'))} testid={`craft-tool-${t.id}`}>
                    {lockedBy ?? (canAfford(nx.cost) ? `Fabricar ${nx.name}` : 'Faltam materiais')}
                  </Btn>
                </>
              ) : <p className="note">Melhor versão já fabricada.</p>}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

// ---------------------------------------------------------------- plantar
export function PlantPanel({ e, i, onClose }: { e: string; i: number; onClose: () => void }) {
  const s = useFarm();
  const lv = level();
  const empty = Array.from({ length: plotCount(e) }, (_, k) => k).filter((k) => !s.ents[e]?.state.p?.[k]);
  const plant = async (c: string, all: boolean) => {
    const targets = all ? empty : [i];
    const rs = await Promise.all(targets.map((k) => store.act({ t: 'plant', e, i: k, c })));
    const ok = rs.filter((r) => r.ok).length;
    if (ok) { play('pop'); toast(`${ok} ${ok === 1 ? 'canteiro plantado' : 'canteiros plantados'} com ${ITEM_BY_ID[c].name}.`, 'ok'); onClose(); }
    const bad = rs.find((r) => !r.ok);
    if (bad) toast(errorText(bad.e), 'warn');
  };
  return (
    <Sheet title={e === 'greenhouse' ? 'Plantar na estufa' : 'O que plantar?'} subtitle={`${empty.length} canteiros livres`} icon="wheat" onClose={onClose}>
      <div className="plant-grid">
        {CROPS.map((c) => {
          const locked = lv < c.level ? `Nível ${c.level}` : c.region && !s.hasRegion(c.region) ? `Região ${REGION_BY_ID[c.region].name}` : null;
          const it = ITEM_BY_ID[c.id];
          return (
            <div key={c.id} className={`plant-card${locked ? ' locked' : ''}`}>
              <Medal icon={c.id} size={58} tone={locked ? 'esm' : 'folha'} />
              <strong>{it.name}</strong>
              <div className="stats">
                <span>{fmtTime(growMs(c.id, e))}</span>
                <span>rende {c.yield}</span>
                <span>{fmt(c.yield * it.price)} moedas</span>
                {c.tool && <span>foice</span>}
              </div>
              {locked ? <span className="lock"><img src={iconUrl('ui_lock', 32)} width={14} height={14} alt="" />{locked}</span> : (
                <>
                  <Btn small onClick={() => plant(c.id, false)} disabled={s.farm!.coins < c.seed} testid={`plant-${c.id}`}>Plantar por {c.seed}</Btn>
                  {empty.length > 1 && <Btn small kind="quiet" onClick={() => plant(c.id, true)} disabled={s.farm!.coins < c.seed * empty.length}>Todos ({empty.length})</Btn>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- ajustes
function SettingsPanel({ onClose, me, onExit, onLookChange }: { onClose: () => void; me: Me; onExit: () => void; onLookChange: (l: Look) => void }) {
  const s = useFarm();
  const [muted, setMuted] = useState(sound.muted);
  const [vol, setVol] = useState(sound.volume);
  const [musicOn, setMusicOn] = useState(sound.musicOn);
  const [mvol, setMvol] = useState(sound.musicVolume);
  const [pw, setPw] = useState({ cur: '', next: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [editing, setEditing] = useState(false);
  const f = s.farm!;
  const copy = async () => { try { await navigator.clipboard.writeText(f.invite_code); toast('Código copiado.', 'ok'); } catch { toast(`Código: ${f.invite_code}`); } };
  const leave = async () => {
    if (!confirm(`Sair da fazenda "${f.name}"? O progresso continua com os outros membros.`)) return;
    const { error } = await supabase.rpc('leave_farm', { p_farm: f.id });
    if (error) toast(errorText(error.message), 'warn'); else onExit();
  };
  if (editing) return <Sheet title="Aparência" onClose={() => setEditing(false)} wide><CharacterEditor embedded me={me} onSaved={(l) => { onLookChange(l); setEditing(false); toast('Aparência salva.', 'ok'); }} /></Sheet>;
  return (
    <Sheet title="Ajustes" subtitle={f.name} icon="ui_gear" onClose={onClose}>
      <section className="panel inset">
        <h3 className="sub">Convide alguém</h3>
        <p className="muted small">Quem entrar com este código passa a cuidar desta mesma fazenda (até 4 membros).</p>
        <div className="row"><code className="invite" data-testid="invite-code">{f.invite_code}</code><Btn small onClick={copy}>Copiar</Btn></div>
      </section>
      <section className="panel inset">
        <h3 className="sub">Membros</h3>
        <ul className="members">
          {s.members.map((m) => (
            <li key={m.user_id}><span className={`dot${s.online.has(m.user_id) ? ' on' : ''}`} /><strong>{m.username}</strong>{m.role === 'owner' && <em>fundador</em>}
              <span className="muted small">{fmt(m.stats.harvest ?? 0)} coletados, {fmt(m.stats.craft ?? 0)} produzidos, {fmt(m.stats.give ?? 0)} em projetos</span></li>
          ))}
        </ul>
      </section>
      <section className="panel inset">
        <h3 className="sub">Som</h3>
        <label className="row"><input type="checkbox" checked={musicOn} onChange={(e) => { sound.unlock(); sound.setMusicOn(e.target.checked); setMusicOn(e.target.checked); if (e.target.checked) music.start(); }} /> Trilha sonora do campo</label>
        <div className="slider"><img src={iconUrl('ui_music', 64)} alt="" /><input type="range" min={0} max={1} step={0.05} value={mvol} onChange={(e) => { sound.setMusicVolume(Number(e.target.value)); setMvol(Number(e.target.value)); }} aria-label="Volume da música" /><span className="small">{Math.round(mvol * 100)}%</span></div>
        <label className="row"><input type="checkbox" checked={!muted} onChange={(e) => { sound.setMuted(!e.target.checked); setMuted(!e.target.checked); }} /> Efeitos sonoros</label>
        <div className="slider"><img src={iconUrl('ui_chat', 64)} alt="" /><input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => { sound.setVolume(Number(e.target.value)); setVol(Number(e.target.value)); play('click'); }} aria-label="Volume dos efeitos" /><span className="small">{Math.round(vol * 100)}%</span></div>
      </section>
      <section className="panel inset">
        <h3 className="sub">Conta</h3>
        <Btn small kind="ghost" onClick={() => setEditing(true)}>Mudar aparência</Btn>
        <form className="pw" onSubmit={async (e) => { e.preventDefault(); setPwMsg(''); try { await changePassword(pw.cur, pw.next, me.username); setPw({ cur: '', next: '' }); setPwMsg('Senha alterada.'); } catch (x) { setPwMsg((x as Error).message); } }}>
          <label>Senha atual<input type="password" autoComplete="current-password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></label>
          <label>Nova senha<input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
          <button className="btn btn-ghost btn-sm" disabled={!pw.cur || !pw.next}>Alterar senha</button>
          {pwMsg && <p className="small">{pwMsg}</p>}
        </form>
      </section>
      <div className="row wrap">
        <Btn kind="ghost" onClick={onExit}>Trocar de fazenda</Btn>
        <Btn kind="quiet" onClick={() => void signOut()}>Sair da conta</Btn>
        <Btn kind="danger" onClick={leave}>Deixar esta fazenda</Btn>
      </div>
    </Sheet>
  );
}
