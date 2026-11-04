export * from './items.ts';
export * from './production.ts';
export * from './buildings.ts';
export * from './world.ts';
export * from './progression.ts';
export * from './workers.ts';
export * from './fields.ts';
export * from './obstacles.ts';
export * from './missions.ts';
export * from './shop.ts';

import { ITEMS } from './items.ts';
import { CROPS, NODES, TOOLS, RECIPES, NODE_BY_ID, RECIPE_BY_ID } from './production.ts';
import { BUILDINGS, REGIONS, BUILDING_BY_ID, REGION_BY_ID } from './buildings.ts';
import { WORLD_NODES } from './world.ts';
import { LEVEL_XP, CONTRACTS, ORDER_NPCS, CONFIG, MAX_LEVEL } from './progression.ts';
import { WORKERS, workerPeriodMs } from './workers.ts';
import { FIELDS, FIELD_OF_CROP, FIELD_SPEED, FIELD_YIELD, fieldPlots } from './fields.ts';
import { OBSTACLES } from './obstacles.ts';
import { MAIN } from './missions.ts';
import { PETS, PET_LEVELS, PERKS, COSMETICS, RUSH } from './shop.ts';

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

/**
 * Tudo que a fazenda precisa ter para conseguir um item: regiões, campos, prédios e ferramenta.
 * Clientes e missões geradas só pedem itens cujos requisitos já estão cumpridos.
 */
export interface ItemReq { r: string[]; f: string[]; b: string[]; t: Record<string, number> }
const reqCache = new Map<string, ItemReq>();
export function itemReq(id: string): ItemReq {
  const hit = reqCache.get(id); if (hit) return hit;
  const out: ItemReq = { r: [], f: [], b: [], t: {} };
  const add = (o: ItemReq) => { for (const k of ['r', 'f', 'b'] as const) for (const v of o[k]) if (!out[k].includes(v)) out[k].push(v); for (const [t, n] of Object.entries(o.t)) out.t[t] = Math.max(out.t[t] ?? 0, n); };
  const recipe = RECIPE_BY_ID[id];
  if (recipe) {
    out.b.push(recipe.b); out.r.push(BUILDING_BY_ID[recipe.b].region);
    for (const k of Object.keys(recipe.in)) add(itemReq(k));
  } else if (FIELD_OF_CROP[id]) {
    const f = FIELDS.find((x) => x.id === FIELD_OF_CROP[id])!;
    out.f.push(f.id); out.r.push(f.region);
    const crop = CROPS.find((c) => c.id === id)!;
    if (crop.tool) out.t[crop.tool] = 1;
  } else {
    // recurso natural: o nó mais acessível que o produz
    const nodes = NODES.filter((n) => n.item === id).sort((a, b) => a.tier - b.tier);
    const best = nodes[0];
    if (best) {
      if (best.tool && best.tier > 0) out.t[best.tool] = best.tier;
      const regs = REGIONS.filter((r) => WORLD_NODES.some((w) => w.t === best.id && w.r === r.id)).sort((a, b) => a.level - b.level);
      if (regs[0]) out.r.push(regs[0].id);
    }
  }
  reqCache.set(id, out);
  return out;
}

/** Recorte do catálogo usado pelo servidor (gerado em SQL). */
export function serverCatalog() {
  return {
    items: Object.fromEntries(ITEMS.map((x) => [x.id, { price: x.price, level: x.level, src: itemSource(x.id), req: itemReq(x.id) }])),
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
    contracts: CONTRACTS.map((x) => ({ id: x.id, npc: x.npc, level: x.level, items: x.items, coins: x.coins, xp: x.xp, rep: x.rep })),
    npcs: ORDER_NPCS,
    config: CONFIG,
    workers: Object.fromEntries(WORKERS.map((w) => [w.id, { item: w.item, region: w.region, level: w.level, cap: w.cap, costs: w.costs.map((c) => ({ coins: c.coins ?? 0, items: c.items ?? {} })), period: [1, 2, 3].map((lv) => workerPeriodMs(w, lv)) }])),
    fields: Object.fromEntries(FIELDS.map((f) => [f.id, {
      crops: f.crops, region: f.region, level: f.level, needs: f.needs ?? null, obs: f.obs ?? null,
      open: { coins: f.open.coins ?? 0, items: f.open.items ?? {} },
      ups: f.ups.map((u) => ({ coins: u.coins ?? 0, items: u.items ?? {} })),
      plots: [1, 2, 3].map((lv) => fieldPlots(f, lv)), speed: FIELD_SPEED, yield: FIELD_YIELD,
    }])),
    obstacles: Object.fromEntries(OBSTACLES.map((o) => [o.id, { region: o.region, tool: o.tool ?? null, level: o.level ?? null, needs: o.needs ?? null, cost: o.cost ? { coins: o.cost.coins ?? 0, items: o.cost.items ?? {} } : null }])),
    mains: Object.fromEntries(MAIN.map((x) => [x.id, { after: x.after, goal: x.goal, r: x.r }])),
    pets: Object.fromEntries(PETS.map((p) => [p.id, { level: p.level, price: { coins: p.price.coins ?? 0, cr: p.price.cr ?? 0 }, ability: p.ability, values: p.values }])),
    petLevels: PET_LEVELS,
    perks: Object.fromEntries(PERKS.map((p) => [p.id, p.levels])),
    cosmetics: Object.fromEntries(COSMETICS.map((c) => [c.id, { level: c.level, coins: c.price.coins ?? 0, cr: c.price.cr ?? 0 }])),
    rush: RUSH,
  };
}

export { REGION_BY_ID };
