import { useEffect, useRef, useState } from 'react';
import { ITEM_BY_ID, BUILDING_BY_ID, REGION_BY_ID, CONFIG, doorTile } from '../../data/catalog.ts';
import { useFarm } from '../../hooks/useStore.ts';
import { store, type Project } from '../../game/state/store.ts';
import { bus } from '../../game/bus.ts';
import { projectOptions, type ProjectOption } from '../../game/rules.ts';
import { Sheet, ItemIcon, Btn, Bar, CostList, toast } from '../ui.tsx';
import { act } from './Panels.tsx';
import { fmt } from '../../utils/format.ts';
import { play } from '../../game/audio.ts';
import { buildingPortrait } from '../../game/art/portraits.ts';
import { iconUrl } from '../../game/art/icons.ts';

const thumbOf = (k: string) => (k.startsWith('r:') ? iconUrl('ui_map', 96) : buildingPortrait(k.slice(2), 128));

/** Valor total (moedas + itens a preço de mercado) entregue/necessário. */
function value(p: Project) {
  let need = p.need.coins ?? 0, got = Math.min(need, p.got.coins ?? 0);
  for (const [k, q] of Object.entries(p.need.items ?? {})) { need += q * ITEM_BY_ID[k].price; got += Math.min(q, p.got[k] ?? 0) * ITEM_BY_ID[k].price; }
  return { need, got };
}

function titleOf(k: string) {
  const id = k.slice(2);
  if (k.startsWith('r:')) return `Expandir: ${REGION_BY_ID[id].name}`;
  if (k.startsWith('u:')) return `${BUILDING_BY_ID[id].name} nível ${store.lvl(id) + 1}`;
  return `Construir ${BUILDING_BY_ID[id].name}`;
}

function focusOnMap(k: string) {
  const id = k.slice(2);
  if (k.startsWith('r:')) { const r = REGION_BY_ID[id].rect; bus.emit('focus', { x: r.x + r.w / 2, y: r.y + r.h / 2 }); }
  else { const d = doorTile(BUILDING_BY_ID[id].spot); bus.emit('focus', { x: d.x, y: d.y - 1 }); }
}

/** Contribui com um recurso; `q` é limitado ao que falta e ao que há no estoque. */
async function give(k: string, i: string, q: number) {
  if (q <= 0) return;
  const r = await act({ t: 'give', k, i, q });
  if (!r.ok) return;
  play('pop');
  if (r.done) {
    play('build');
    toast(r.coop ? `${titleOf(k)} concluído em equipe! Bônus de cooperação: +XP, +reputação e 10% das moedas de volta.` : `${titleOf(k)} concluído!`, 'ok');
  }
}

function ActiveProject({ p, highlight }: { p: Project; highlight: boolean }) {
  const s = useFarm();
  const { need, got } = value(p);
  const totalBy = Object.values(p.by).reduce((a, b) => a + b, 0) || 1;
  const rows: [string, number][] = [...(p.need.coins ? [['coins', p.need.coins] as [string, number]] : []), ...Object.entries(p.need.items ?? {})];
  const giveAll = async () => {
    for (const [k, q] of rows) {
      const rem = q - (p.got[k] ?? 0);
      const have = k === 'coins' ? s.farm!.coins : s.qty(k);
      if (rem > 0 && have > 0) await give(p.k, k, Math.min(rem, have));
    }
  };
  return (
    <li className={`proj panel${highlight ? ' hl' : ''}`} data-testid={`proj-${p.k}`}>
      <div className="proj-head"><img className="thumb" src={thumbOf(p.k)} alt="" /><div className="grow"><strong>{titleOf(p.k)}</strong><button className="link" onClick={() => focusOnMap(p.k)}>Ver no mapa</button></div></div>
      <div className="row"><Bar value={got} max={need} /><span className="small">{Math.floor((got / Math.max(1, need)) * 100)}%</span></div>
      <ul className="need">
        {rows.map(([k, q]) => {
          const g = p.got[k] ?? 0;
          const have = k === 'coins' ? s.farm!.coins : s.qty(k);
          const rem = Math.max(0, q - g);
          return (
            <li key={k} className={rem === 0 ? 'done' : ''}>
              {k === 'coins' ? <ItemIcon id="coin" size={26} /> : <ItemIcon id={k} size={26} />}
              <span className="grow">{k === 'coins' ? 'Moedas' : ITEM_BY_ID[k].name}<small>{fmt(Math.min(g, q))}/{fmt(q)}{rem > 0 ? `, ${k === 'coins' ? 'em caixa' : 'no estoque'} ${fmt(have)}` : ''}</small></span>
              {rem > 0 && <Btn small disabled={have === 0} onClick={() => give(p.k, k, Math.min(rem, have))} testid={`give-${p.k}-${k}`}>Entregar {fmt(Math.min(rem, have))}</Btn>}
            </li>
          );
        })}
      </ul>
      <Btn small kind="ghost" onClick={giveAll} testid={`give-all-${p.k}`}>Entregar tudo o que temos</Btn>
      {Object.keys(p.by).length > 0 && (
        <div className="contrib">
          <span className="small muted">Quem contribuiu</span>
          {Object.entries(p.by).sort((a, b) => b[1] - a[1]).map(([u, v]) => (
            <div key={u} className="contrib-row"><span>{store.memberName(u)}</span><Bar value={v} max={totalBy} tone="folha" /><span className="small">{Math.round((v / totalBy) * 100)}%</span></div>
          ))}
          {Object.keys(p.by).length < 2 && <p className="small note">Com 2 ou mais membros contribuindo (cada um com {Math.round(CONFIG.coopMinShare * 100)}%+), a obra rende bônus de cooperação.</p>}
        </div>
      )}
    </li>
  );
}

export function ProjectsPanel({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  const [focus, setFocus] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => bus.on('projects:focus', (k: string) => setFocus(k)), []);
  useEffect(() => {
    if (!focus) return;
    const el = listRef.current?.querySelector(`[data-k="${focus}"], [data-testid="proj-${focus}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus, s.version]);

  const active = s.projects().map((e) => e.state.proj!);
  const activeKeys = new Set(active.map((p) => p.k));
  const options = projectOptions().filter((o) => !activeKeys.has(o.k));
  const start = (o: ProjectOption) => {
    // inicia entregando o primeiro recurso disponível
    const first = (o.cost.coins ?? 0) > 0 && s.farm!.coins > 0 ? ['coins', Math.min(o.cost.coins!, s.farm!.coins)] as const
      : Object.entries(o.cost.items ?? {}).map(([k, q]) => [k, Math.min(q, s.qty(k))] as const).find(([, q]) => q > 0);
    if (!first) { toast('Junte pelo menos um dos materiais para iniciar o projeto.', 'info'); return; }
    return give(o.k, first[0], first[1]).then(() => setFocus(o.k));
  };

  return (
    <Sheet title="Quadro de projetos" subtitle="Obras coletivas: cada um entrega o que puder" icon="ui_build" onClose={onClose}>
      <div ref={listRef}>
        <p className="muted small">Construções, melhorias e expansões são obras coletivas: qualquer membro entrega parte dos materiais, a qualquer hora, e o progresso fica salvo.</p>
        {active.length > 0 && <h3 className="sub">Em andamento ({active.length}/4)</h3>}
        <ul className="list">{active.map((p) => <ActiveProject key={p.k} p={p} highlight={focus === p.k} />)}</ul>
        <h3 className="sub">Disponíveis</h3>
        <ul className="list">
          {options.map((o) => (
            <li key={o.k} data-k={o.k} className={`proj panel${o.locked ? ' locked' : ''}${focus === o.k ? ' hl' : ''}`}>
              <div className="proj-head"><img className="thumb" src={thumbOf(o.k)} alt="" /><div className="grow"><strong>{o.title}</strong>{o.locked ? <span className="lock"><img src={iconUrl('ui_lock', 32)} width={14} height={14} alt="" />{o.locked}</span> : <button className="link" onClick={() => focusOnMap(o.k)}>Ver no mapa</button>}</div></div>
              <p className="muted small">{o.desc}</p>
              <CostList cost={o.cost} />
              {!o.locked && <Btn small onClick={() => start(o)} disabled={active.length >= 4} testid={`start-${o.k}`}>{active.length >= 4 ? 'Máximo de 4 projetos' : 'Começar entregando'}</Btn>}
            </li>
          ))}
        </ul>
        {options.length === 0 && active.length === 0 && <p className="empty">Tudo construído! A fazenda está completa.</p>}
      </div>
    </Sheet>
  );
}
