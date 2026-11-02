// Regras derivadas do catálogo (espelham as validações do servidor para a interface).
import {
  CONFIG, BUILDINGS, BUILDING_BY_ID, CROP_BY_ID, RECIPES, REGIONS, TOOLS, CROPS, ITEMS, MAX_LEVEL, LEVEL_XP,
  type Cost,
} from '../data/catalog.ts';
import { store } from './state/store.ts';

export const capacity = () => {
  const b = Math.max(1, store.lvl('barn'));
  const w = store.lvl('warehouse');
  return CONFIG.barnCap[b - 1] + (w > 0 ? CONFIG.warehouseCap[w - 1] : 0);
};

export const plotCount = (e: string) => {
  if (e === 'field') return CONFIG.plots[Math.max(1, store.lvl('farmhouse')) - 1];
  const g = store.lvl('greenhouse');
  return g > 0 ? CONFIG.greenhousePlots[g - 1] : 0;
};

export const growMs = (crop: string, e: string) => {
  const w = store.lvl('well');
  let m = 1 - (w > 0 ? CONFIG.wellBonus[w - 1] : 0);
  if (e === 'greenhouse') m *= CONFIG.greenhouseSpeed;
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
    const needs = r.needs && store.lvl(r.needs) < 1 ? `Exige ${BUILDING_BY_ID[r.needs].name}` : null;
    out.push({ k: `r:${r.id}`, title: `Expandir: ${r.name}`, desc: r.desc, level: r.level, cost: r.cost, locked: lv < r.level ? `Nível ${r.level}` : needs });
  }
  return out.sort((a, b) => (a.locked ? 1 : 0) - (b.locked ? 1 : 0) || a.level - b.level);
}

export const entityKeyFor = (k: string) => (k.startsWith('r:') ? `region:${k.slice(2)}` : k.slice(2));
