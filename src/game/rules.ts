// Regras derivadas do catálogo (espelham as validações do servidor para a interface).
import {
  CONFIG, REGION_BY_ID, TOOL_BY_ID, OBSTACLES, OBSTACLE_OF_REGION, type ObstacleDef, type FieldDef, FIELD_BY_ID, FIELD_SPEED, FIELD_YIELD, fieldPlots, BUILDINGS, BUILDING_BY_ID, CROP_BY_ID, RECIPES, REGIONS, TOOLS, CROPS, ITEMS, MAX_LEVEL, LEVEL_XP,
  type Cost,
} from '../data/catalog.ts';
import { store } from './state/store.ts';

export const capacity = () => {
  const b = Math.max(1, store.lvl('barn'));
  const w = store.lvl('warehouse');
  return CONFIG.barnCap[b - 1] + (w > 0 ? CONFIG.warehouseCap[w - 1] : 0);
};

export const plotCount = (e: string) => {
  if (e.startsWith('f:')) { const lv = store.lvl(e); return lv > 0 ? fieldPlots(FIELD_BY_ID[e.slice(2)], lv) : 0; }
  const g = store.lvl('greenhouse');
  return g > 0 ? CONFIG.greenhousePlots[g - 1] : 0;
};

export const growMs = (crop: string, e: string) => {
  const w = store.lvl('well');
  let m = 1 - (w > 0 ? CONFIG.wellBonus[w - 1] : 0);
  if (e === 'greenhouse') m *= CONFIG.greenhouseSpeed;
  else if (e.startsWith('f:')) m *= FIELD_SPEED[Math.max(1, store.lvl(e)) - 1];
  return CROP_BY_ID[crop].time * 1000 * m;
};

export const queueSlots = (b: string) => CONFIG.queueBase + store.lvl(b) - 1;
export const craftMs = (time: number, b: string) => time * 1000 * (1 - 0.1 * (store.lvl(b) - 1));
export const marketBonus = () => { const m = store.lvl('market'); return m > 0 ? CONFIG.marketBonus[m - 1] : 0; };
export const boardSlots = () => CONFIG.boardSlots[Math.max(1, store.lvl('order_board')) - 1];
export const level = () => store.farm?.level ?? 1;
export const xpNeed = (lv: number) => (lv >= MAX_LEVEL ? 0 : LEVEL_XP[lv - 1]);

export const canAfford = (c: Cost) =>
  (store.farm?.coins ?? 0) >= (c.coins ?? 0) && Object.entries(c.items ?? {}).every(([k, v]) => store.qty(k) >= v);

/** Tudo que um nível libera, para a tela de progressão. */
export function unlocksAt(lv: number) {
  return {
    crops: CROPS.filter((c) => c.level === lv),
    recipes: RECIPES.filter((r) => r.level === lv),
    buildings: BUILDINGS.filter((b) => b.kind !== 'starter' && b.level === lv),
    upgrades: BUILDINGS.flatMap((b) => b.upgrades.map((u, i) => ({ b, lvl: i + 2, u }))).filter((x) => x.u.level === lv),
    regions: REGIONS.filter((r) => r.level === lv && r.id !== 'sitio'),
    tools: TOOLS.flatMap((t) => t.tiers.filter((x) => x.level === lv && !(t.id === 'axe' && x.tier === 1)).map((x) => ({ t, x }))),
    items: ITEMS.filter((i) => i.level === lv),
  };
}

export type ProjectOption = { k: string; title: string; desc: string; level: number; cost: Cost; locked: string | null; region?: string };

/** Projetos que a fazenda pode iniciar agora ou em breve (construções, melhorias, regiões). */
export function projectOptions(): ProjectOption[] {
  const lv = level();
  const out: ProjectOption[] = [];
  for (const b of BUILDINGS) {
    const cur = store.lvl(b.id);
    if (b.kind !== 'starter' && cur === 0) {
      const regionOk = store.hasRegion(b.region);
      out.push({ k: `b:${b.id}`, title: `Construir ${b.name}`, desc: b.desc + (b.effect ? ` ${b.effect}` : ''), level: b.level, cost: b.cost, region: b.region,
        locked: lv < b.level ? `Nível ${b.level}` : !regionOk ? `Região: ${REGIONS.find((r) => r.id === b.region)!.name}` : null });
    } else if (cur >= 1 && cur - 1 < b.upgrades.length) {
      const u = b.upgrades[cur - 1];
      out.push({ k: `u:${b.id}`, title: `${b.name} nível ${cur + 1}`, desc: b.kind === 'producer' ? 'Mais uma vaga na fila de produção e 10% mais rápido.' : b.effect, level: u.level, cost: u, region: b.region,
        locked: lv < u.level ? `Nível ${u.level}` : null });
    }
  }
  for (const r of REGIONS) {
    if (r.id === 'sitio' || store.hasRegion(r.id)) continue;
    const o = OBSTACLE_OF_REGION[r.id];
    out.push({ k: `r:${r.id}`, title: o ? `${o.name}: abrir ${r.name}` : `Expandir: ${r.name}`, desc: o?.desc ?? r.desc, level: r.level, cost: r.cost, locked: o ? obstacleInfo(o).lock : lv < r.level ? `Nível ${r.level}` : null });
  }
  for (const o of OBSTACLES) {
    if (o.region || store.hasObs(o.id)) continue;
    const info = obstacleInfo(o);
    out.push({ k: info.k, title: o.name, desc: o.desc, level: info.lvReq, cost: info.cost, locked: info.lock ?? (store.hasRegion('rio') ? null : 'Abra a Margem do Rio') });
  }
  return out.sort((a, b) => (a.locked ? 1 : 0) - (b.locked ? 1 : 0) || a.level - b.level);
}

export const entityKeyFor = (k: string) => (k.startsWith('r:') ? `region:${k.slice(2)}` : k.startsWith('o:') ? `obs:${k.slice(2)}` : k.slice(2));

/** Estado de um obstáculo físico: requisitos, custo, obra e se já foi removido. */
export function obstacleInfo(o: ObstacleDef) {
  const reg = o.region ? REGION_BY_ID[o.region] : null;
  const lvReq = reg?.level ?? o.level ?? 1;
  const cost: Cost = reg ? reg.cost : o.cost ?? {};
  const needs = reg?.needs ?? o.needs;
  const k = o.region ? `r:${o.region}` : `o:${o.id}`;
  const cleared = o.region ? store.hasRegion(o.region) : store.hasObs(o.id);
  const proj = store.ents[entityKeyFor(k)]?.state.proj;
  const tool = o.tool ? TOOL_BY_ID[o.tool.t].tiers[o.tool.tier - 1] : null;
  const lock = level() < lvReq ? `Nível ${lvReq}`
    : o.tool && store.tool(o.tool.t) < o.tool.tier ? `Precisa de ${tool!.name}`
    : needs && store.lvl(needs) < 1 ? `Exige ${BUILDING_BY_ID[needs].name}` : null;
  let need = cost.coins ?? 0, got = Math.min(need, proj?.got.coins ?? 0);
  for (const [it, q] of Object.entries(cost.items ?? {})) { const p = ITEMS.find((x) => x.id === it)?.price ?? 1; need += q * p; got += Math.min(q, proj?.got[it] ?? 0) * p; }
  return { lvReq, cost, needs, k, cleared, proj, tool, lock, pct: proj ? Math.round((100 * got) / Math.max(1, need)) : 0, name: reg?.name };
}

/** Estado de um campo especializado: nível, canteiros e o que falta para abrir/melhorar. */
export function fieldInfo(f: FieldDef) {
  const e = `f:${f.id}`, lv = store.lvl(e);
  const next = lv === 0 ? f.open : f.ups[lv - 1] ?? null;
  const reqLv = lv === 0 ? f.level : f.level + 3 * lv;
  const lock = !store.hasRegion(f.region) ? `Região ${REGION_BY_ID[f.region].name} fechada`
    : level() < reqLv ? `Nível ${reqLv}`
    : lv === 0 && f.needs && store.lvl(f.needs) < 1 ? `Exige ${BUILDING_BY_ID[f.needs].name}`
    : lv === 0 && f.obs && !store.hasObs(f.obs) ? 'Reconstrua as pontes do rio' : null;
  return { e, lv, next, reqLv, lock, plots: plotCount(e) };
}

export const fieldYield = (e: string) => (e.startsWith('f:') ? FIELD_YIELD[Math.max(1, store.lvl(e)) - 1] : 0);
