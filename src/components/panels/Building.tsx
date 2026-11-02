import { BUILDING_BY_ID, RECIPES, ITEM_BY_ID, CROPS } from '../../data/catalog.ts';
import { useFarm, useTicker } from '../../hooks/useStore.ts';
import { bus } from '../../game/bus.ts';
import { queueSlots, craftMs, level, growMs, plotCount, canAfford } from '../../game/rules.ts';
import { Sheet, ItemIcon, Btn, Bar, CostList, toast } from '../ui.tsx';
import { act } from './Panels.tsx';
import { fmtTime } from '../../utils/format.ts';
import { play } from '../../game/audio.ts';

function Greenhouse() {
  const s = useFarm();
  const n = plotCount('greenhouse');
  const slots = s.ents.greenhouse?.state.p ?? [];
  return (
    <section>
      <h3 className="sub">Canteiros da estufa</h3>
      <div className="gh-grid">
        {Array.from({ length: n }, (_, i) => {
          const sl = slots[i];
          if (!sl) return <button key={i} className="gh-plot" onClick={() => bus.emit('panel', { plant: 'greenhouse', i })}>Plantar</button>;
          const left = sl[1] + growMs(sl[0], 'greenhouse') - s.now();
          return (
            <button key={i} className={`gh-plot${left <= 0 ? ' ready' : ''}`} onClick={async () => {
              if (left > 0) return;
              const r = await act({ t: 'reap', e: 'greenhouse', i });
              if (r.ok) { play('pop'); toast(`+${r.q} ${ITEM_BY_ID[sl[0]].name}`, 'ok'); }
            }}>
              <ItemIcon id={sl[0]} size={30} /><span>{left > 0 ? fmtTime(left) : 'Colher'}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function BuildingPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useFarm();
  useTicker(1000);
  const b = BUILDING_BY_ID[id];
  const lvl = s.lvl(id);
  const q = s.ents[id]?.state.q ?? [];
  const now = s.now();
  const recipes = RECIPES.filter((r) => r.b === id);
  const slots = queueSlots(id);
  const readyN = q.filter((e) => e[1] <= now).length;
  const upgrade = b.upgrades[lvl - 1];
  const proj = s.ents[id]?.state.proj;
  const lv = level();

  const craft = async (r: string) => {
    const res = await act({ t: 'craft', b: id, r });
    if (res.ok) play('pop');
  };
  const collect = async () => {
    const res = await act({ t: 'collect', b: id });
    if (res.ok) { play('coin'); toast(`Coletado: ${res.n} ${Number(res.n) === 1 ? 'produção' : 'produções'}.`, 'ok'); }
  };

  return (
    <Sheet title={`${b.name}${lvl > 1 ? ` (nível ${lvl})` : ''}`} onClose={onClose}>
      <p className="muted small">{b.desc} {b.effect}</p>
      {id === 'greenhouse' && <Greenhouse />}
      {id === 'farmhouse' && <p className="note">{plotCount('field')} canteiros liberados no campo.</p>}
      {(id === 'workbench' || id === 'toolshed') && <Btn small kind="ghost" onClick={() => bus.emit('panel', 'tools')}>Abrir ferramentas</Btn>}

      {recipes.length > 0 && (
        <>
          <div className="row between">
            <h3 className="sub">Produção ({q.length}/{slots})</h3>
            {readyN > 0 && <Btn small onClick={collect} testid="collect">Coletar {readyN}</Btn>}
          </div>
          {q.length === 0 ? <p className="empty small">Fila vazia. Escolha uma receita abaixo.</p> : (
            <ul className="queue">
              {q.map(([r, at], k) => {
                const total = craftMs(RECIPES.find((x) => x.id === r)!.time, id);
                const left = at - now;
                return (
                  <li key={k}>
                    <ItemIcon id={r} size={28} />
                    <span className="grow">{ITEM_BY_ID[r].name}<Bar value={total - Math.max(0, left)} max={total} tone={left <= 0 ? 'folha' : 'ipe'} /></span>
                    <span className="small">{left <= 0 ? 'pronto' : fmtTime(left)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <h3 className="sub">Receitas</h3>
          <ul className="list">
            {recipes.map((r) => {
              const locked = lv < r.level;
              const can = canAfford({ items: r.in });
              return (
                <li key={r.id} className={`recipe${locked ? ' locked' : ''}`} data-testid={`recipe-${r.id}`}>
                  <ItemIcon id={r.id} size={38} />
                  <div className="grow">
                    <strong>{r.out > 1 ? `${r.out}× ` : ''}{ITEM_BY_ID[r.id].name}</strong>
                    <span className="muted small">{fmtTime(craftMs(r.time, id))}, +{r.xp} XP</span>
                    <CostList cost={{ items: r.in }} />
                  </div>
                  {locked ? <span className="lock">Nível {r.level}</span> : (
                    <Btn small disabled={!can || q.length >= slots} onClick={() => craft(r.id)} testid={`craft-${r.id}`}>{q.length >= slots ? 'Fila cheia' : 'Produzir'}</Btn>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {upgrade && !proj && (
        <section className="panel inset">
          <h3 className="sub">Melhorar para nível {lvl + 1}</h3>
          <p className="muted small">{b.kind === 'producer' ? 'Mais uma vaga na fila e 10% mais rápido.' : b.effect}</p>
          <CostList cost={upgrade} />
          <Btn small kind="ghost" disabled={lv < upgrade.level} onClick={() => { bus.emit('panel', 'projects'); setTimeout(() => bus.emit('projects:focus', `u:${id}`), 50); }}>
            {lv < upgrade.level ? `Nível ${upgrade.level}` : 'Abrir no Quadro de Projetos'}
          </Btn>
        </section>
      )}
      {proj && <p className="note">Melhoria em andamento no Quadro de Projetos.</p>}
      {id === 'well' && <p className="small">Cultivos do campo: {CROPS.slice(0, 3).map((c) => `${ITEM_BY_ID[c.id].name} ${fmtTime(growMs(c.id, 'field'))}`).join(', ')}.</p>}
    </Sheet>
  );
}
