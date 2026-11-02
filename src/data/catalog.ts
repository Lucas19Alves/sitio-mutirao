export * from './items.ts';
export * from './production.ts';
export * from './buildings.ts';
export * from './world.ts';
export * from './progression.ts';

import { ITEMS } from './items.ts';
import { CROPS, NODES, TOOLS, RECIPES, NODE_BY_ID, RECIPE_BY_ID } from './production.ts';
import { BUILDINGS, REGIONS, BUILDING_BY_ID, REGION_BY_ID } from './buildings.ts';
import { WORLD_NODES } from './world.ts';
import { LEVEL_XP, QUESTS, CONTRACTS, ORDER_NPCS, CONFIG, MAX_LEVEL } from './progression.ts';

/** De onde vem cada item: região onde aparece e, para produtos, o prédio. */
export function itemSource(id: string): { r: string; b?: string } {
  const recipe = RECIPE_BY_ID[id];
  if (recipe) return { r: BUILDING_BY_ID[recipe.b].region, b: recipe.b };
  const crop = CROPS.find((c) => c.id === id);
  if (crop) return { r: crop.region ?? 'sitio' };
  const regs = new Set(WORLD_NODES.filter((n) => NODE_BY_ID[n.t].item === id).map((n) => n.r));
  const best = REGIONS.filter((r) => regs.has(r.id)).sort((a, b) => a.level - b.level)[0];
  return { r: best?.id ?? 'sitio' };
}

/** Recorte do catálogo usado pelo servidor (gerado em SQL). */
export function serverCatalog() {
  return {
    items: Object.fromEntries(ITEMS.map((x) => [x.id, { price: x.price, level: x.level, src: itemSource(x.id) }])),
    crops: Object.fromEntries(CROPS.map((x) => [x.id, { level: x.level, seed: x.seed, time: x.time, yield: x.yield, xp: x.xp, tool: x.tool ?? null, region: x.region ?? null }])),
    nodes: Object.fromEntries(NODES.map((x) => [x.id, { item: x.item, qty: x.qty, tool: x.tool ?? null, tier: x.tier, respawn: x.respawn, xp: x.xp }])),
    world: Object.fromEntries(WORLD_NODES.map((n) => [n.id, { t: n.t, r: n.r }])),
    tools: Object.fromEntries(TOOLS.map((t) => [t.id, t.tiers.map((x) => ({ tier: x.tier, level: x.level, coins: x.cost.coins ?? 0, items: x.cost.items ?? {}, needs: x.needs }))])),
    buildings: Object.fromEntries(BUILDINGS.map((b) => [b.id, {
      kind: b.kind, region: b.region, level: b.level,
      cost: { coins: b.cost.coins ?? 0, items: b.cost.items ?? {} },
      upgrades: b.upgrades.map((u) => ({ level: u.level, coins: u.coins ?? 0, items: u.items ?? {} })),
    }])),
    recipes: Object.fromEntries(RECIPES.map((r) => [r.id, { b: r.b, level: r.level, in: r.in, out: r.out, time: r.time, xp: r.xp }])),
    regions: Object.fromEntries(REGIONS.map((r) => [r.id, { level: r.level, coins: r.cost.coins ?? 0, items: r.cost.items ?? {}, needs: r.needs ?? null }])),
    levels: LEVEL_XP,
    maxLevel: MAX_LEVEL,
    quests: QUESTS.map((x) => ({ goal: x.goal, coins: x.coins, xp: x.xp })),
    contracts: CONTRACTS.map((x) => ({ id: x.id, npc: x.npc, level: x.level, items: x.items, coins: x.coins, xp: x.xp, rep: x.rep })),
    npcs: ORDER_NPCS,
    config: CONFIG,
  };
}

export { REGION_BY_ID };
