// Auto-checagem do catálogo: referências, sobreposição de prédios e se cada
// requisito é alcançável no nível em que é pedido. Roda com `node` (type stripping).
import * as C from '../src/data/catalog.ts';

const errors = [];
const err = (m) => errors.push(m);
const items = C.ITEM_BY_ID;

// Nível em que cada item fica obtível
const avail = {};
for (const n of C.NODES) {
  const regs = C.WORLD_NODES.filter((w) => w.t === n.id).map((w) => C.REGION_BY_ID[w.r].level);
  const toolLv = n.tool ? C.TOOL_BY_ID[n.tool].tiers.find((t) => t.tier === n.tier)?.level ?? 99 : 1;
  if (regs.length) avail[n.item] = Math.min(avail[n.item] ?? 99, Math.max(Math.min(...regs), toolLv));
}
for (const c of C.CROPS) avail[c.id] = Math.min(avail[c.id] ?? 99, Math.max(c.level, c.region ? C.REGION_BY_ID[c.region].level : 1));
for (let pass = 0; pass < 10; pass++) {
  for (const r of C.RECIPES) {
    const b = C.BUILDING_BY_ID[r.b];
    if (!b) { err(`receita ${r.id}: prédio ${r.b} inexistente`); continue; }
    const lv = Math.max(r.level, b.level, C.REGION_BY_ID[b.region].level, ...Object.keys(r.in).map((k) => avail[k] ?? 99));
    avail[r.id] = Math.min(avail[r.id] ?? 99, lv);
  }
}

const checkCost = (label, cost, level) => {
  for (const [k, v] of Object.entries(cost.items ?? {})) {
    if (!items[k]) err(`${label}: item ${k} inexistente`);
    else if ((avail[k] ?? 99) > level) err(`${label} (nv ${level}) pede ${k}, obtível só no nv ${avail[k]}`);
    if (!(v > 0)) err(`${label}: quantidade inválida ${k}`);
  }
};

for (const it of C.ITEMS) if (avail[it.id] === undefined) err(`item ${it.id} não tem origem`);
for (const r of C.RECIPES) { if (!items[r.id]) err(`receita ${r.id} sem item`); for (const k of Object.keys(r.in)) if (!items[k]) err(`receita ${r.id}: insumo ${k}`); }
for (const b of C.BUILDINGS) {
  checkCost(`prédio ${b.id}`, b.cost, Math.max(b.level, C.REGION_BY_ID[b.region].level));
  b.upgrades.forEach((u, i) => checkCost(`upgrade ${b.id}#${i + 2}`, u, u.level));
}
for (const r of C.REGIONS) checkCost(`região ${r.id}`, r.cost, r.level);
for (const t of C.TOOLS) for (const tier of t.tiers) checkCost(`ferramenta ${t.id}${tier.tier}`, tier.cost, tier.level);
for (const ct of C.CONTRACTS) checkCost(`contrato ${ct.id}`, { items: ct.items }, ct.level + 1);

// Prédios não se sobrepõem e ficam dentro da região
const occ = new Map();
for (const b of C.BUILDINGS) {
  const reg = C.REGION_BY_ID[b.region].rect;
  const s = b.spot;
  if (s.x < reg.x || s.y < reg.y || s.x + s.w > reg.x + reg.w || s.y + s.h + 1 > reg.y + reg.h) err(`prédio ${b.id} fora da região ${b.region}`);
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
    const k = `${x},${y}`;
    if (occ.has(k)) err(`prédio ${b.id} sobrepõe ${occ.get(k)}`);
    occ.set(k, b.id);
  }
}
for (let i = 0; i < C.PLOT_COUNT; i++) {
  const p = C.plotTile(i);
  for (let y = p.y; y < p.y + 2; y++) for (let x = p.x; x < p.x + 2; x++) if (occ.has(`${x},${y}`)) err(`canteiro ${i} sobrepõe ${occ.get(`${x},${y}`)}`);
}
for (const b of C.BUILDINGS) { const d = C.doorTile(b.spot); if (occ.has(`${d.x},${d.y}`)) err(`porta de ${b.id} bloqueada por ${occ.get(`${d.x},${d.y}`)}`); }

// Tudo alcançável a partir do spawn com todas as regiões abertas e prédios construídos
{
  const g = C.buildWalkGrid(new Set(C.REGIONS.map((r) => r.id)), new Set(C.BUILDINGS.map((b) => b.id)), new Set(C.OBSTACLES.map((o) => o.id)));
  const seen = new Uint8Array(g.length); const qx = [C.SPAWN.x + C.SPAWN.y * C.MAP_W]; seen[qx[0]] = 1;
  while (qx.length) { const i = qx.pop(); const x = i % C.MAP_W, y = (i / C.MAP_W) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const j = (y + dy) * C.MAP_W + x + dx; if (g[j] && !seen[j]) { seen[j] = 1; qx.push(j); } } }
  const reach = (x, y) => [[0,0],[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => seen[(y + dy) * C.MAP_W + x + dx]);
  for (const b of C.BUILDINGS) { const d = C.doorTile(b.spot); if (!seen[d.y * C.MAP_W + d.x]) err('porta inalcançável: ' + b.id); }
  for (const n of C.WORLD_NODES) if (!reach(n.x, n.y)) err('nó inalcançável: ' + n.id);
}

// Contagem de nós
const perType = {};
for (const n of C.WORLD_NODES) perType[n.t] = (perType[n.t] ?? 0) + 1;

console.log(`itens ${C.ITEMS.length} · receitas ${C.RECIPES.length} · prédios ${C.BUILDINGS.length} · regiões ${C.REGIONS.length} · nós ${C.WORLD_NODES.length} · missões principais ${C.MAIN.length} · campos ${C.FIELDS.length} · pets ${C.PETS.length} · contratos ${C.CONTRACTS.length}`);
console.log('nós por tipo', JSON.stringify(perType));
console.log('XP por nível', C.LEVEL_XP.join(' '), '· total', C.LEVEL_XP.reduce((a, b) => a + b, 0));
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('catálogo OK');
