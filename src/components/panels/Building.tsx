import { BUILDING_BY_ID, RECIPES, ITEM_BY_ID, CROPS } from '../../data/catalog.ts';
import { useFarm, useTicker } from '../../hooks/useStore.ts';
import { bus } from '../../game/bus.ts';
import { queueSlots, craftMs, level, growMs, plotCount } from '../../game/rules.ts';
import { Sheet, ItemIcon, Btn, CostList, Ring, Section, toast } from '../ui.tsx';
import { act } from './Panels.tsx';
import { fmtTime } from '../../utils/format.ts';
import { play } from '../../game/audio.ts';
import { buildingPortrait, useThumbs } from '../../game/art/portraits.ts';
import { iconUrl } from '../../game/art/icons.ts';

function Greenhouse() {
  const s = useFarm();
  const n = plotCount('greenhouse');
  const slots = s.ents.greenhouse?.state.p ?? [];
  return (
    <Section title="Canteiros da estufa">
      <div className="gh-grid">
        {Array.from({ length: n }, (_, i) => {
          const sl = slots[i];
          if (!sl) return <button key={i} className="gh-plot" onClick={() => bus.emit('panel', { plant: 'greenhouse', i })}>Plantar</button>;
          const total = growMs(sl[0], 'greenhouse');
          const left = sl[1] + total - s.now();
          return (
            <button key={i} className={`gh-plot${left <= 0 ? ' ready' : ''}`} onClick={async () => {
              if (left > 0) return;
              const r = await act({ t: 'reap', e: 'greenhouse', i });
              if (r.ok) { play('pop'); toast(`+${r.q} ${ITEM_BY_ID[sl[0]].name}`, 'ok', sl[0]); }
            }}>
              <Ring value={total - Math.max(0, left)} max={total} size={44}><ItemIcon id={sl[0]} size={26} /></Ring>
              <span>{left > 0 ? fmtTime(left) : 'Colher'}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

export function BuildingPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useFarm();
  useThumbs();
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

  const craft = async (r: string) => { const res = await act({ t: 'craft', b: id, r }); if (res.ok) play('pop'); };
  const collect = async () => {
    const first = q[0]?.[0];
    const res = await act({ t: 'collect', b: id });
    if (res.ok) { play('coin'); toast(`Coletado: ${res.n} ${Number(res.n) === 1 ? 'produção' : 'produções'}.`, 'ok', first); }
  };

  return (
    <Sheet title={b.name} subtitle={b.kind === 'producer' ? `Produção, ${recipes.length} receitas` : 'Construção de apoio'} src={buildingPortrait(id, 120)} onClose={onClose}>
      <div className="b-hero">
        <img src={buildingPortrait(id, 240)} alt="" />
        <div className="grow">
          <span className="stars" aria-label={`Nível ${lvl}`}>{'★'.repeat(lvl)}{'☆'.repeat(Math.max(0, b.upgrades.length + 1 - lvl))}</span>
          <p className="small">{b.desc}</p>
          <div className="effects">
            {b.effect && <span>{b.effect}</span>}
            {recipes.length > 0 && <span>{slots} vagas na fila</span>}
            {lvl > 1 && recipes.length > 0 && <span>{(lvl - 1) * 10}% mais rápido</span>}
          </div>
        </div>
      </div>
      {id === 'greenhouse' && <Greenhouse />}
      {id === 'farmhouse' && <p className="note">{plotCount('field')} canteiros liberados no campo.</p>}
      {(id === 'workbench' || id === 'toolshed') && <Btn small kind="ghost" onClick={() => bus.emit('panel', 'tools')}>Abrir ferramentas</Btn>}

      {recipes.length > 0 && (
        <>
          <Section title="Fila de produção" aside={readyN > 0 ? <Btn small onClick={collect} testid="collect">Coletar {readyN}</Btn> : <span className="small muted">{q.length}/{slots}</span>}>
            <ul className="queue">
              {q.map(([r, at], k) => {
                const total = craftMs(RECIPES.find((x) => x.id === r)!.time, id);
                const left = at - now;
                const started = k === 0 || q[k - 1][1] <= now;
                return (
                  <li key={k}>
                    <Ring value={started ? total - Math.max(0, left) : 0} max={total} size={54}><ItemIcon id={r} size={30} /></Ring>
                    <span>{left <= 0 ? 'pronto' : started ? fmtTime(left) : 'na fila'}</span>
                  </li>
                );
              })}
              {Array.from({ length: Math.max(0, slots - q.length) }, (_, k) => <li key={`e${k}`}><span className="slot-empty">+</span><span className="muted">livre</span></li>)}
            </ul>
          </Section>
          <Section title="Receitas">
            <ul className="list">
              {recipes.map((r) => {
                const locked = lv < r.level;
                const can = Object.entries(r.in).every(([k, n]) => s.qty(k) >= n);
                return (
                  <li key={r.id} className={`recipe${locked ? ' locked' : ''}`} data-testid={`recipe-${r.id}`}>
                    <span className="recipe-out"><ItemIcon id={r.id} size={40} />{r.out > 1 && <b>×{r.out}</b>}</span>
                    <div className="grow">
                      <strong>{ITEM_BY_ID[r.id].name}</strong>
                      <div className="recipe-flow">
                        {Object.entries(r.in).map(([k, n]) => (
                          <span key={k} className={`inp${s.qty(k) >= n ? '' : ' miss'}`} title={`${ITEM_BY_ID[k].name}: ${s.qty(k)}/${n}`}><ItemIcon id={k} size={26} /><b>{n}</b></span>
                        ))}
                        <span className="arrow">→</span>
                        <span className="small muted"><img src={iconUrl('ui_clock', 32)} width={14} height={14} alt="" /> {fmtTime(craftMs(r.time, id))}, +{r.xp} XP</span>
                      </div>
                    </div>
                    {locked ? <span className="lock">Nível {r.level}</span> : (
                      <Btn small disabled={!can || q.length >= slots} onClick={() => craft(r.id)} testid={`craft-${r.id}`}>{q.length >= slots ? 'Fila cheia' : 'Produzir'}</Btn>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
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
      {id === 'well' && <p className="small">Cultivos do campo agora: {CROPS.slice(0, 3).map((c) => `${ITEM_BY_ID[c.id].name} ${fmtTime(growMs(c.id, 'field'))}`).join(', ')}.</p>}
    </Sheet>
  );
}
