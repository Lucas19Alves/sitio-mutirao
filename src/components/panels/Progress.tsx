import { MAX_LEVEL, REGIONS, ITEM_BY_ID, levelReward } from '../../data/catalog.ts';
import { useFarm } from '../../hooks/useStore.ts';
import { unlocksAt, xpNeed } from '../../game/rules.ts';
import { bus } from '../../game/bus.ts';
import { Sheet, Bar, ItemIcon } from '../ui.tsx';
import { fmt } from '../../utils/format.ts';

export function ProgressPanel({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  const f = s.farm!;
  const need = xpNeed(f.level);
  const st = f.progression.stats;
  return (
    <Sheet title="Progressão da fazenda" subtitle={`Nível ${f.level} de ${MAX_LEVEL}`} icon="ui_progress" onClose={onClose}>
      <div className="prog-head">
        <span className="plate small" style={{ ['--p' as string]: `${(need ? f.xp / need : 1) * 360}deg` }}><span className="plate-lv">{f.level}</span></span>
        <div className="grow">
          <strong>Nível {f.level} de {MAX_LEVEL}</strong>
          {need ? <><Bar value={f.xp} max={need} /><span className="small muted">Faltam {fmt(need - f.xp)} XP. Subir de nível dá {levelReward(f.level + 1)} moedas.</span></> : <span className="note">Nível máximo!</span>}
        </div>
      </div>

      <h3 className="sub">Regiões</h3>
      <ul className="regions">
        {REGIONS.map((r) => {
          const open = s.hasRegion(r.id);
          return (
            <li key={r.id} className={open ? 'open' : ''}>
              <button onClick={() => { bus.emit('focus', { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 }); onClose(); }}>
                <strong>{r.name}</strong><span className="small">{open ? 'Aberta' : `Nível ${r.level}`}</span>
                <small className="muted">{r.desc}</small>
              </button>
            </li>
          );
        })}
      </ul>

      <h3 className="sub">O que cada nível libera</h3>
      <ol className="levels">
        {Array.from({ length: MAX_LEVEL }, (_, k) => k + 1).map((lv) => {
          const u = unlocksAt(lv);
          const tags = [
            ...u.regions.map((r) => ({ t: `Região: ${r.name}`, k: 'r' })),
            ...u.buildings.map((b) => ({ t: b.name, k: 'b' })),
            ...u.tools.map(({ x }) => ({ t: x.name, k: 't' })),
            ...u.upgrades.map(({ b, lvl }) => ({ t: `${b.name} nv ${lvl}`, k: 'u' })),
          ];
          const items = [...u.crops.map((c) => c.id), ...u.recipes.map((r) => r.id)];
          return (
            <li key={lv} className={lv <= f.level ? 'past' : lv === f.level + 1 ? 'next' : ''}>
              <span className="lv-n">{lv}</span>
              <div className="lv-body">
                {tags.length + items.length === 0 ? <span className="muted small">Novos pedidos e contratos maiores</span> : (
                  <>
                    <div className="tags">{tags.map((t) => <span key={t.t} className={`tag tag-${t.k}`}>{t.t}</span>)}</div>
                    {items.length > 0 && <div className="lv-items">{items.map((i) => <span key={i} title={ITEM_BY_ID[i].name}><ItemIcon id={i} size={22} /></span>)}</div>}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <h3 className="sub">Números da fazenda</h3>
      <dl className="stats">
        <div><dt>Pedidos entregues</dt><dd>{fmt(st.orders ?? 0)}</dd></div>
        <div><dt>Contratos concluídos</dt><dd>{fmt(st.contracts ?? 0)}</dd></div>
        <div><dt>Obras concluídas</dt><dd>{fmt(st.projects ?? 0)}</dd></div>
        <div><dt>Obras em equipe</dt><dd>{fmt(st.coop ?? 0)}</dd></div>
        <div><dt>Itens vendidos</dt><dd>{fmt(st.sold ?? 0)}</dd></div>
        <div><dt>Reputação</dt><dd>★ {fmt(f.reputation)}</dd></div>
      </dl>
    </Sheet>
  );
}
