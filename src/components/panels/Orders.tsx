import { ITEM_BY_ID, CONTRACTS, CONFIG } from '../../data/catalog.ts';
import { useFarm } from '../../hooks/useStore.ts';
import { store } from '../../game/state/store.ts';
import { boardSlots, level } from '../../game/rules.ts';
import { Sheet, ItemIcon, Btn, Bar, Coins, toast } from '../ui.tsx';
import { act } from './Panels.tsx';
import { fmt } from '../../utils/format.ts';
import { play } from '../../game/audio.ts';
import { npcPortrait } from '../../game/art/portraits.ts';

export function OrdersPanel({ onClose }: { onClose: () => void }) {
  const s = useFarm();
  const slots = boardSlots();
  const orders = Object.values(s.orders).filter((o) => o.slot < slots).sort((a, b) => a.slot - b.slot);
  const contract = s.orders[99];
  const cdef = contract && CONTRACTS.find((c) => c.id === contract.order_key);
  const cLocked = contract && level() < (contract.reward.level ?? 0);
  const got = contract?.progress.got ?? {};
  const by = contract?.progress.by ?? {};
  const totalBy = Object.values(by).reduce((a, b) => a + b, 0) || 1;
  const cNeed = contract ? Object.entries(contract.items).reduce((a, [k, q]) => a + q * ITEM_BY_ID[k].price, 0) : 1;
  const cGot = contract ? Object.entries(contract.items).reduce((a, [k, q]) => a + Math.min(q, got[k] ?? 0) * ITEM_BY_ID[k].price, 0) : 0;

  const deliver = async (slot: number) => {
    const r = await act({ t: 'order', o: slot });
    if (r.ok) { play('coin'); toast('Pedido entregue!', 'ok'); }
  };
  const cgive = async (item: string, q: number) => {
    const r = await act({ t: 'cgive', i: item, q });
    if (r.ok) { play('pop'); if (r.done) { play('level'); toast(r.coop ? 'Contrato concluído em equipe! +30% de recompensa.' : 'Contrato concluído!', 'ok'); } }
  };

  return (
    <Sheet title="Pedidos e contratos" subtitle="Encomendas de moradores e comerciantes" icon="ui_scroll" onClose={onClose}>
      {contract && cdef && (
        <section className={`contract panel${cLocked ? ' locked' : ''}`} data-testid="contract">
          <div className="row between"><span className="tag">Contrato coletivo</span>{cLocked && <span className="lock">Nível {contract.reward.level}</span>}</div>
          <div className="npc"><img src={npcPortrait(contract.npc, 96)} alt="" /><div><h3>{cdef.title}</h3><p className="muted small">{contract.npc} encomendou em grande quantidade. Cada membro entrega o que puder; a recompensa é da fazenda.</p></div></div>
          <div className="row"><Bar value={cGot} max={cNeed} /><span className="small">{Math.floor((cGot / cNeed) * 100)}%</span></div>
          <ul className="need">
            {Object.entries(contract.items).map(([k, q]) => {
              const g = got[k] ?? 0, rem = Math.max(0, q - g), have = s.qty(k);
              return (
                <li key={k} className={rem === 0 ? 'done' : ''}>
                  <ItemIcon id={k} size={26} />
                  <span className="grow">{ITEM_BY_ID[k].name}<small>{Math.min(g, q)}/{q}{rem > 0 ? `, estoque ${have}` : ''}</small></span>
                  {rem > 0 && !cLocked && <Btn small disabled={have === 0} onClick={() => cgive(k, Math.min(rem, have))} testid={`cgive-${k}`}>Entregar {Math.min(rem, have)}</Btn>}
                </li>
              );
            })}
          </ul>
          <div className="reward">
            <Coins n={contract.reward.coins} /><span>+{fmt(contract.reward.xp)} XP</span><span>★ +{contract.reward.rep}</span>
            <span className="note small">+{Math.round(CONFIG.coopContractBonus * 100)}% se 2+ membros contribuírem</span>
          </div>
          {Object.keys(by).length > 0 && (
            <div className="contrib">
              {Object.entries(by).sort((a, b) => b[1] - a[1]).map(([u, v]) => (
                <div key={u} className="contrib-row"><span>{store.memberName(u)}</span><Bar value={v} max={totalBy} tone="folha" /><span className="small">{Math.round((v / totalBy) * 100)}%</span></div>
              ))}
            </div>
          )}
        </section>
      )}

      <h3 className="sub">Pedidos dos moradores</h3>
      <ul className="list">
        {orders.map((o) => {
          const ready = Object.entries(o.items).every(([k, q]) => s.qty(k) >= q);
          return (
            <li key={o.slot} className={`order panel${ready ? ' ready' : ''}`} data-testid={`order-${o.slot}`}>
              <div className="row between"><span className="npc"><img src={npcPortrait(o.npc, 96)} alt="" /><strong>{o.npc}</strong></span><span className="reward"><Coins n={o.reward.coins} size={16} /><span>+{o.reward.xp} XP</span></span></div>
              <ul className="order-items">
                {Object.entries(o.items).map(([k, q]) => (
                  <li key={k} className={s.qty(k) >= q ? 'ok' : 'miss'}><ItemIcon id={k} size={30} /><span>{Math.min(s.qty(k), q)}/{q}</span><small>{ITEM_BY_ID[k].name}</small></li>
                ))}
              </ul>
              <div className="row">
                <Btn small disabled={!ready} onClick={() => deliver(o.slot)} testid={`deliver-${o.slot}`}>{ready ? 'Entregar' : 'Faltam itens'}</Btn>
                <Btn small kind="quiet" onClick={() => act({ t: 'skip', o: o.slot })}>Trocar pedido</Btn>
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
