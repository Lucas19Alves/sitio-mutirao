// Retratos para a interface: miniaturas dos prédios e rostos dos moradores.
import { BUILDING_BY_ID, REGION_BY_ID } from '../../data/catalog.ts';
import { isoBuildingArt, isoSoilArt, isoCropArt } from './isoWorld.ts';
import { nodeArts } from './world.ts';
import { portrait, LOOK_LIMITS, type Look } from './characters.ts';
import { canvas, mulberry, shade } from './draw.ts';

const cache = new Map<string, string>();

/** Prédio isométrico recortado para caber num quadro. */
export function buildingPortrait(id: string, size = 160): string {
  const key = `b:${id}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const art = isoBuildingArt(BUILDING_BY_ID[id]);
  const { c, ctx } = canvas(size, size);
  const s = Math.min(size / art.c.width, size / art.c.height) * 1.05;
  ctx.drawImage(art.c, (size - art.c.width * s) / 2, (size - art.c.height * s) / 2 + size * 0.04, art.c.width * s, art.c.height * s);
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
  // recorta a parte de cima do frame (64x96 a 2x) onde ficam cabeça e chapéu
  ctx.drawImage(full, 12, 0, 104, 104, 0, 0, size, size);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export const regionName = (id: string) => REGION_BY_ID[id]?.name ?? id;

/** Mini ilha isométrica para a tela de entrada. */
export function dioramaUrl(): string {
  const hit = cache.get('diorama');
  if (hit) return hit;
  const W = 760, H = 470, N = 9, M = 7, TWd = 64, THd = 32;
  const { c, ctx } = canvas(W * 2, H * 2);
  ctx.scale(2, 2);
  const ox = W / 2 - ((N - M) * TWd) / 4, oy = 120;
  const iso = (x: number, y: number) => ({ x: (x - y) * (TWd / 2) + ox, y: (x + y) * (THd / 2) + oy });
  const rnd = mulberry(5);
  // laterais
  const side = (ax: number, ay: number, bx: number, by: number, col: string) => {
    const a = iso(ax, ay), b = iso(bx, by);
    for (const [z0, z1, k] of [[0, 8, '#5f8f3a'], [8, 30, col], [30, 62, shade(col, -0.2)]] as const) {
      ctx.beginPath(); ctx.moveTo(a.x, a.y + z0); ctx.lineTo(b.x, b.y + z0); ctx.lineTo(b.x, b.y + z1); ctx.lineTo(a.x, a.y + z1); ctx.closePath(); ctx.fillStyle = k; ctx.fill();
    }
  };
  side(0, M, N, M, '#8a5a35'); side(N, 0, N, M, '#6f472a');
  for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
    const p = iso(x + 0.5, y + 0.5);
    const path = y === 3 || (x === 4 && y > 3);
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 16.5); ctx.lineTo(p.x + 32.5, p.y); ctx.lineTo(p.x, p.y + 16.5); ctx.lineTo(p.x - 32.5, p.y); ctx.closePath();
    ctx.fillStyle = path ? shade('#d6b47a', (rnd() - 0.5) * 0.06) : shade('#8cc152', (rnd() - 0.5) * 0.06); ctx.fill();
  }
  for (let i = 0; i < 70; i++) { const p = iso(rnd() * N, rnd() * M); ctx.fillStyle = ['#f28cb1', '#fff176', '#ffffff'][i % 3]; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill(); }
  // objetos em ordem de profundidade
  type Obj = { d: number; draw: () => void };
  const objs: Obj[] = [];
  const putIso = (a: { c: HTMLCanvasElement; ox: number; oy: number }, tx: number, ty: number, d: number) => {
    const p = iso(tx, ty);
    objs.push({ d, draw: () => ctx.drawImage(a.c, p.x - a.ox / 2, p.y - a.oy / 2, a.c.width / 2, a.c.height / 2) });
  };
  putIso(isoBuildingArt(BUILDING_BY_ID.mill), 5.6, 0.3, 5.6 + 0.3 + 3);
  putIso(isoBuildingArt(BUILDING_BY_ID.well), 2, 0.6, 2 + 0.6 + 2);
  putIso(isoBuildingArt(BUILDING_BY_ID.sales_cart), 5.8, 4.2, 5.8 + 4.2 + 2.5);
  const soil = isoSoilArt(false);
  for (const [tx, ty, crop] of [[0.6, 4.2, 'wheat'], [2.6, 4.2, 'carrot']] as const) { putIso(soil, tx, ty, -1); putIso(isoCropArt(crop, 2), tx, ty, tx + ty + 2); }
  const nodes = nodeArts();
  const tree = (k: string, tx: number, ty: number, s = 0.62) => {
    const a = nodes[k], p = iso(tx, ty);
    objs.push({ d: tx + ty, draw: () => ctx.drawImage(a.c, p.x - a.c.width * a.ox * s, p.y - a.c.height * a.oy * s, a.c.width * s, a.c.height * s) });
  };
  tree('tree_oak', 0.6, 0.7); tree('apple_tree', 0.5, 2.3); tree('tree_big', 8.4, 6.2, 0.55); tree('orange_tree', 8.5, 4.2); tree('grass', 3.4, 2.4); tree('rock_small', 7.6, 2.7); tree('tree_oak', 1.2, 6.4, 0.5);
  const chars: [Look, number, number][] = [
    [{ skin: 1, hair: 2, hairColor: 3, shirt: 2, shirtColor: 0, pants: 0, hat: 1, hatColor: 0, acc: 0 }, 3.6, 3.4],
    [{ skin: 4, hair: 5, hairColor: 0, shirt: 1, shirtColor: 2, pants: 3, hat: 0, hatColor: 3, acc: 4 }, 4.6, 3.7],
  ];
  for (const [look, tx, ty] of chars) {
    const pc = portrait(look, 1), p = iso(tx, ty), s = 0.62;
    objs.push({ d: tx + ty + 0.1, draw: () => ctx.drawImage(pc, p.x - pc.width * s / 2, p.y - pc.height * 0.93 * s, pc.width * s, pc.height * s) });
  }
  objs.sort((a, b) => a.d - b.d).forEach((o) => o.draw());
  const url = c.toDataURL('image/png');
  cache.set('diorama', url);
  return url;
}
