// Missões no cliente: progresso lido do estado real da fazenda (o servidor valida o mesmo).
import {
  MAIN, GEN_LABEL, ITEM_BY_ID, BUILDING_BY_ID, REGION_BY_ID, FIELD_BY_ID, OBSTACLE_BY_ID, OBSTACLE_OF_REGION, TOOL_BY_ID,
  type Goal, type MainMission, type ToolId,
} from '../data/catalog.ts';
import { store, type GenMission } from './state/store.ts';
import type { Target } from './three/Game3D.ts';

export function goalProgress(g: Goal): [number, number] {
  const f = store.farm!;
  switch (g.k) {
    case 'stat': return [Math.min(g.n, f.progression.stats[g.key] ?? 0), g.n];
    case 'built': return [Math.min(g.lv, store.lvl(g.b)), g.lv];
    case 'tool': return [Math.min(g.tier, store.tool(g.tool)), g.tier];
    case 'region': return [store.hasRegion(g.r) ? 1 : 0, 1];
    case 'level': return [Math.min(g.n, f.level), g.n];
    case 'field': return [Math.min(g.lv, store.lvl(`f:${g.f}`)), g.lv];
    case 'obs': return [store.hasObs(g.o) ? 1 : 0, 1];
    case 'bag': return [Math.min(g.tier, Math.max(0, ...store.members.map((m) => m.bag_tier ?? 0))), g.tier];
    case 'pets': return [Math.min(g.n, store.members.reduce((a, m) => a + Object.keys(m.pets?.own ?? {}).length, 0)), g.n];
  }
}

export const mainDone = (id: string) => !!store.farm?.progression.mdone?.includes(id);

/** Missões principais disponíveis agora (anteriores concluídas), na ordem da campanha. */
export function mainsOpen(): MainMission[] {
  return MAIN.filter((m) => !mainDone(m.id) && m.after.every(mainDone));
}

/** Ícone que representa o objetivo. */
export function goalIcon(g: Goal | { k: 'gen'; key: string }): { icon?: string; building?: string } {
  if (g.k === 'built') return { building: g.b };
  if (g.k === 'tool') return { icon: 'ui_tools' };
  if (g.k === 'region' || g.k === 'obs') return { icon: 'ui_map' };
  if (g.k === 'level') return { icon: 'ui_progress' };
  if (g.k === 'field') return { icon: FIELD_BY_ID[g.f].crops[0] };
  if (g.k === 'bag') return { icon: 'ui_bag' };
  if (g.k === 'pets') return { icon: 'ui_people' };
  const key = g.key;
  const [kind, item] = key.split(':');
  if (item && ITEM_BY_ID[item]) return { icon: item };
  return { icon: kind === 'plant' ? 'wheat' : kind === 'orders' ? 'ui_scroll' : kind === 'deposit' ? 'ui_barn' : 'star' };
}

/** Para onde o personagem vai quando o jogador toca "Ir". */
export function goalTarget(g: Goal): Target | null {
  if (g.k === 'built') return { kind: 'building', id: store.lvl(g.b) >= 1 || BUILDING_BY_ID[g.b].kind === 'starter' ? g.b : g.b };
  if (g.k === 'field') return { kind: 'field', f: g.f };
  if (g.k === 'region') return OBSTACLE_OF_REGION[g.r] ? { kind: 'obs', id: OBSTACLE_OF_REGION[g.r].id } : null;
  if (g.k === 'obs') return { kind: 'obs', id: g.o };
  if (g.k === 'bag' || g.k === 'pets') return { kind: 'building', id: 'farmhouse' };
  if (g.k === 'tool') return { kind: 'building', id: 'toolshed' };
  if (g.k === 'stat' && g.key === 'orders') return { kind: 'building', id: 'order_board' };
  if (g.k === 'stat' && g.key === 'deposit') return { kind: 'building', id: 'barn' };
  return null;
}

/** Texto curto do objetivo (para listas e para o cartão da missão). */
export function goalText(g: Goal): string {
  switch (g.k) {
    case 'stat': { const [kind, item] = g.key.split(':'); return item ? `${kind === 'c' ? 'Produzir' : 'Coletar'} ${g.n} ${ITEM_BY_ID[item]?.name ?? item}` : `${GEN_LABEL[kind] ?? kind}: ${g.n}`; }
    case 'built': return g.lv > 1 ? `${BUILDING_BY_ID[g.b].name} nível ${g.lv}` : `Construir ${BUILDING_BY_ID[g.b].name}`;
    case 'tool': return `Fabricar ${TOOL_BY_ID[g.tool as ToolId].tiers[g.tier - 1].name}`;
    case 'region': return `Abrir ${REGION_BY_ID[g.r].name}`;
    case 'level': return `Fazenda nível ${g.n}`;
    case 'field': return g.lv > 1 ? `${FIELD_BY_ID[g.f].name} nível ${g.lv}` : `Abrir ${FIELD_BY_ID[g.f].name}`;
    case 'obs': return OBSTACLE_BY_ID[g.o].name;
    case 'bag': return 'Mochila maior';
    case 'pets': return `Adotar ${g.n} pet`;
  }
}

/** Missões geradas (secundárias, diárias, cooperativas). */
export function genTitle(m: GenMission) {
  const [kind, item] = m.k.split(':');
  if (item) return `${kind === 'c' ? 'Produza' : 'Colete'} ${m.n} ${ITEM_BY_ID[item]?.name ?? item}`;
  return `${GEN_LABEL[kind] ?? kind}: ${m.n}`;
}
export function genProgress(m: GenMission): [number, number] {
  const cur = (store.farm?.progression.stats[m.k] ?? 0) - m.base;
  return [Math.max(0, Math.min(m.n, cur)), m.n];
}
