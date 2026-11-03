// Retratos para a interface: miniaturas dos prédios, rostos dos moradores e a cena da entrada.
import { BUILDING_BY_ID, REGION_BY_ID } from '../../data/catalog.ts';
import { buildingArt } from './cartoon/buildings.ts';
import { buildTileset, IDX, CELL, COLS, PAD, TS } from './cartoon/terrain.ts';
import { nodeArts, decorArts } from './cartoon/nature.ts';
import { cropArt, soilArt } from './cartoon/crops.ts';
import { portrait, LOOK_LIMITS, FW, FH, FOOT, type Look } from './characters.ts';
import { canvas } from './draw.ts';

const cache = new Map<string, string>();

/** Prédio recortado para caber num quadro. */
export function buildingPortrait(id: string, size = 160): string {
  const key = `b:${id}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const art = buildingArt(BUILDING_BY_ID[id]);
  const { c, ctx } = canvas(size, size);
  const s = Math.min(size / art.c.width, size / art.c.height) * 1.04;
  ctx.drawImage(art.c, (size - art.c.width * s) / 2, (size - art.c.height * s) / 2, art.c.width * s, art.c.height * s);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

function hash(s: string) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

/** Aparência determinística a partir do nome (moradores, contratantes). */
export function npcLook(name: string): Look {
  let h = hash(name);
  const next = (n: number) => { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return h % n; };
  return Object.fromEntries(Object.entries(LOOK_LIMITS).map(([k, n]) => [k, next(n)])) as unknown as Look;
}

/** Busto (cabeça e ombros) de um morador. */
export function npcPortrait(name: string, size = 64): string {
  const key = `n:${name}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const full = portrait(npcLook(name), 2);
  const { c, ctx } = canvas(size, size);
  // cabeça e chapéu ficam na faixa superior do quadro (80×124 a 2×)
  ctx.drawImage(full, 10, 34, 140, 140, 0, 0, size, size);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export const regionName = (id: string) => REGION_BY_ID[id]?.name ?? id;

/** Cena top-down do sítio para a tela de entrada (mesma arte do jogo). */
export function dioramaUrl(): string {
  const hit = cache.get('diorama');
  if (hit) return hit;
  const T = 64; // 1 tile = 64 px nesta imagem (arte a 2× desenhada em escala 1)
  const N = 12, M = 8;
  const { c, ctx } = canvas(N * T, M * T);
  const tiles = buildTileset();
  const tile = (i: number, tx: number, ty: number) => ctx.drawImage(tiles, (i % COLS) * CELL + PAD, Math.floor(i / COLS) * CELL + PAD, TS, TS, tx * T, ty * T, T, T);
  for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) tile(IDX.grass(0, (x * 7 + y * 3) % 4), x, y);
  for (let x = 0; x < N; x++) tile(IDX.path(2 | 8 | (x === 6 ? 4 : 0)), x, 5);
  tile(IDX.path(1 | 4), 6, 6); tile(IDX.path(1 | 4), 6, 7);
  const put = (a: { c: HTMLCanvasElement; ox: number; oy: number }, px: number, py: number, s = 1) => ctx.drawImage(a.c, px - a.c.width * a.ox * s, py - a.c.height * a.oy * s, a.c.width * s, a.c.height * s);
  const nature = nodeArts(), decor = decorArts();
  type Obj = { y: number; draw: () => void };
  const objs: Obj[] = [];
  const at = (y: number, draw: () => void) => objs.push({ y, draw });
  // prédios (origem = canto do lote)
  for (const [id, tx, ty] of [['farmhouse', 0.6, 1], ['mill', 8.4, 2], ['well', 6.4, 3]] as const) {
    const b = BUILDING_BY_ID[id], a = buildingArt(b);
    at((ty + b.spot.h) * T, () => put(a, tx * T, ty * T));
  }
  // canteiros
  for (const [tx, crop, s] of [[1, 'wheat', 5], [3.2, 'carrot', 4], [5.4 + 2.3, 'sunflower', 5]] as const) {
    const ty = 6;
    at(-1, () => put(soilArt(false), tx * T, ty * T));
    at((ty + 2) * T - 4, () => put(cropArt(crop, s), tx * T, ty * T));
  }
  // árvores e enfeites
  for (const [k, tx, ty, src] of [['apple_tree', 11.4, 4.9, nature], ['pine', 11.5, 8.1, decor], ['bush', 5.7, 4.9, decor], ['flowers_a', 7.6, 1.2, decor], ['flowers_b', 10.2, 7.6, decor], ['rock_small', 7.9, 4.8, nature], ['grass', 5.6, 7.8, nature], ['oak_d', 6.8, 1.6, decor]] as const) {
    at(ty * T, () => put(src[k], tx * T, ty * T));
  }
  // dois moradores conversando no caminho
  const chars: [Look, number, number][] = [
    [{ skin: 1, hair: 2, hairColor: 3, shirt: 2, shirtColor: 0, pants: 0, hat: 1, hatColor: 0, acc: 0 }, 5.3, 5.75],
    [{ skin: 4, hair: 5, hairColor: 0, shirt: 1, shirtColor: 2, pants: 3, hat: 0, hatColor: 3, acc: 4 }, 6.4, 5.85],
  ];
  for (const [look, tx, ty] of chars) {
    const pc = portrait(look, 1);
    at(ty * T, () => ctx.drawImage(pc, tx * T - FW / 2, ty * T - FH * FOOT, FW, FH));
  }
  objs.sort((a, b) => a.y - b.y).forEach((o) => o.draw());
  const url = c.toDataURL('image/png');
  cache.set('diorama', url);
  return url;
}
