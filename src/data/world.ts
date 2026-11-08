// Layout do mapa (em tiles). Determinístico: cliente e servidor enxergam os
// mesmos nós de recurso com os mesmos ids.
import { BUILDINGS, REGIONS } from './buildings.ts';
import { NODE_BY_ID } from './production.ts';
import { FIELDS } from './fields.ts';

export const TILE = 32;
export const MAP_W = 100;
export const MAP_H = 80;

/** Rio corre na faixa y 44..46 de ponta a ponta, com duas pontes. */
export const RIVER = { y0: 44, y1: 46 };
export const BRIDGES = [{ x0: 30, x1: 31 }, { x0: 52, x1: 53 }, { x0: 80, x1: 81 }];

/** Lago das Garças (elipse, em tiles). */
export const LAKE = { cx: 80, cy: 33, rx: 9, ry: 5.5 };
export const inLake = (x: number, y: number) => ((x + 0.5 - LAKE.cx) / LAKE.rx) ** 2 + ((y + 0.5 - LAKE.cy) / LAKE.ry) ** 2 <= 1;

/** Caminhos de terra (polilinhas em tiles, largura 1 tile). */
export const PATHS: [number, number][][] = [
  [[2, 24], [62, 24]],
  [[33, 2], [33, 26]],
  [[32, 29], [32, 50]],
  [[30, 22], [30, 24]],
  [[15, 14], [15, 24]],
  [[48, 9], [48, 18]],
  [[48, 18], [48, 24]],
  [[10, 41], [10, 43], [30, 43]],
  [[30, 43], [30, 50]],
  [[52, 40], [52, 50]],
  [[22, 14], [33, 14]],
  [[39, 9], [48, 9]],
  [[44, 30], [56, 30]],
  [[27, 40], [52, 40]],
  // v1.3
  [[62, 24], [96, 24]],
  [[48, 9], [80, 9]],
  [[80, 9], [80, 24]],
  [[56, 30], [68, 30]],
  [[68, 24], [68, 41]],
  [[80, 41], [80, 62]],
  [[30, 50], [30, 64]],
  [[4, 64], [60, 64]],
  [[52, 50], [52, 64]],
  [[60, 62], [94, 62]],
];


export const SPAWN = { x: 31, y: 25 };

/** Quantidade de nós por região. */
const NODE_PLAN: Record<string, [string, number][]> = {
  sitio: [['tree_oak', 10], ['grass', 10], ['rock_small', 5]],
  pomar: [['apple_tree', 7], ['orange_tree', 6], ['peach_tree', 5], ['grass', 5], ['tree_oak', 3]],
  bosque: [['tree_oak', 9], ['tree_big', 10], ['herb_bush', 7], ['mushroom', 7], ['rock_small', 4]],
  rio: [['clay', 9], ['sand', 9], ['reeds', 8], ['tree_oak', 4]],
  colinas: [['rock_big', 9], ['rock_small', 5], ['coal', 7], ['copper', 7], ['iron', 7]],
  vale: [['wildflower', 14], ['tree_oak', 5], ['rock_small', 3], ['grass', 4]],
  planalto: [['gold', 6], ['crystal', 5], ['coal', 5], ['rock_big', 4]],
  pasto: [['grass', 12], ['tree_oak', 7], ['wildflower', 6], ['rock_small', 5]],
  lago: [['fish_spot', 9], ['deep_spot', 5], ['reeds', 8], ['tree_oak', 5], ['sand', 5]],
  cafezal: [['banana_tree', 8], ['cacao_tree', 7], ['tree_oak', 5], ['rock_small', 5], ['herb_bush', 4]],
  mata: [['tree_big', 8], ['acai_palm', 8], ['bamboo', 9], ['mushroom', 5], ['crystal', 3], ['rock_big', 4]],
};
const WATER_NODES = new Set(['fish_spot', 'deep_spot']);

export interface WorldNode { id: string; t: string; r: string; x: number; y: number }

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isWater(x: number, y: number) {
  if (inLake(x, y)) return true;
  if (y < RIVER.y0 || y > RIVER.y1) return false;
  return !BRIDGES.some((b) => x >= b.x0 && x <= b.x1);
}

/** Tiles ocupados pelos caminhos (rasterização simples das polilinhas). */
function pathTiles(): Set<string> {
  const s = new Set<string>();
  for (const line of PATHS) {
    for (let k = 0; k < line.length - 1; k++) {
      const [ax, ay] = line[k];
      const [bx, by] = line[k + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let t = 0; t <= steps; t++) {
        const x = Math.round(ax + ((bx - ax) * t) / steps);
        const y = Math.round(ay + ((by - ay) * t) / steps);
        s.add(`${x},${y}`);
      }
    }
  }
  return s;
}

export const PATH_TILES = pathTiles();

/** Tiles ocupados por prédios e pelo campo. */
export function buildingTiles(): Map<string, string> {
  const m = new Map<string, string>();
  for (const b of BUILDINGS) for (let y = b.spot.y; y < b.spot.y + b.spot.h; y++) for (let x = b.spot.x; x < b.spot.x + b.spot.w; x++) m.set(`${x},${y}`, b.id);
  for (const f of FIELDS) for (let y = f.y; y < f.y + f.rows * 2; y++) for (let x = f.x; x < f.x + f.cols * 2; x++) m.set(`${x},${y}`, `f:${f.id}`);
  return m;
}

function buildWorld(): WorldNode[] {
  const rand = mulberry32(20261102);
  const blocked = new Set<string>(PATH_TILES);
  const hard = buildingTiles();
  const block = (x: number, y: number, w: number, h: number, margin: number) => {
    for (let yy = y - margin; yy < y + h + margin; yy++) for (let xx = x - margin; xx < x + w + margin; xx++) blocked.add(`${xx},${yy}`);
  };
  for (const b of BUILDINGS) {
    block(b.spot.x, b.spot.y, b.spot.w, b.spot.h, 0);
    const d = doorTile(b.spot);
    block(d.x - 1, d.y, 3, 2, 0);
  }
  for (const f of FIELDS) block(f.x - 1, f.y - 1, f.cols * 2 + 2, f.rows * 2 + 2, 0);
  block(SPAWN.x - 1, SPAWN.y - 1, 3, 3, 0);
  for (let y = RIVER.y0 - 1; y <= RIVER.y1 + 1; y++) for (let x = 0; x < MAP_W; x++) blocked.add(`${x},${y}`);

  const nodes: WorldNode[] = [];
  for (const reg of REGIONS) {
    const plan = NODE_PLAN[reg.id] ?? [];
    let idx = 0;
    for (const [type, count] of plan) {
      const def = NODE_BY_ID[type];
      let placed = 0;
      let tries = 0;
      while (placed < count && tries < 4000) {
        tries++;
        const x = reg.rect.x + Math.floor(rand() * reg.rect.w);
        const y = reg.rect.y + Math.floor(rand() * reg.rect.h);
        // argila/areia/junco só nas margens do rio
        const nearRiver = y >= RIVER.y0 - 3 && y <= RIVER.y1 + 3;
        if ((type === 'clay' || type === 'sand' || type === 'reeds') !== nearRiver && reg.id === 'rio') continue;
        if (inLake(x, y)) continue;
        const shore = inLake(x + 1, y) || inLake(x - 1, y) || inLake(x, y + 1) || inLake(x, y - 1);
        if (WATER_NODES.has(type) !== shore && (WATER_NODES.has(type) || ((type === 'reeds' || type === 'sand') && reg.id === 'lago'))) continue;
        if (blocked.has(`${x},${y}`)) continue;
        // espaçamento: sólidos precisam de 1 tile livre ao redor para não fechar caminhos
        const gap = def.solid ? 1 : 0;
        let ok = true;
        // sólidos não encostam em prédios/campo, para não fechar passagens
        if (def.solid) for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (hard.has(`${xx},${yy}`)) ok = false;
        for (let yy = y - gap; yy <= y + gap && ok; yy++) for (let xx = x - gap; xx <= x + gap; xx++) if (blocked.has(`n${xx},${yy}`)) { ok = false; break; }
        if (!ok) continue;
        blocked.add(`${x},${y}`);
        blocked.add(`n${x},${y}`);
        nodes.push({ id: `${reg.id}_${idx++}`, t: type, r: reg.id, x, y });
        placed++;
      }
    }
  }
  return nodes;
}

export const WORLD_NODES = buildWorld();
export const WORLD_NODE_BY_ID = Object.fromEntries(WORLD_NODES.map((n) => [n.id, n])) as Record<string, WorldNode>;

export function regionAt(x: number, y: number): string | null {
  for (const r of REGIONS) if (x >= r.rect.x && x < r.rect.x + r.rect.w && y >= r.rect.y && y < r.rect.y + r.rect.h) return r.id;
  return null;
}

/** Tile de interação de um prédio (logo abaixo da porta). */
export function doorTile(s: { x: number; y: number; w: number; h: number }) { return { x: s.x + Math.floor(s.w / 2), y: s.y + s.h }; }

/**
 * Grade de caminhabilidade (1 = livre). Regiões bloqueadas, água, prédios
 * construídos e nós sólidos bloqueiam.
 */
export function buildWalkGrid(unlocked: Set<string>, built: Set<string>, obs: Set<string> = new Set()): Uint8Array<ArrayBuffer> {
  const g = new Uint8Array(MAP_W * MAP_H);
  const bridges = obs.has('pontes');
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const r = regionAt(x, y);
    const river = y >= RIVER.y0 && y <= RIVER.y1;
    g[y * MAP_W + x] = r && unlocked.has(r) && !isWater(x, y) && (!river || bridges) ? 1 : 0;
  }
  for (const b of BUILDINGS) {
    if (!built.has(b.id)) continue;
    for (let y = b.spot.y; y < b.spot.y + b.spot.h; y++) for (let x = b.spot.x; x < b.spot.x + b.spot.w; x++) g[y * MAP_W + x] = 0;
  }
  for (const n of WORLD_NODES) if (NODE_BY_ID[n.t].solid) g[n.y * MAP_W + n.x] = 0;
  return g;
}
