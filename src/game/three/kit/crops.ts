// Canteiros (2×2 tiles) e cultivos 3D em 6 estágios: 0 solo preparado · 1 semente · 2 broto ·
// 3 crescendo · 4 adulta · 5 pronta. Origem = canto do canteiro.
import * as THREE from 'three';
import { Kit, rng, tint } from './geo.ts';

export const STAGES = 6;
export const stageOf = (f: number) => (f >= 1 ? 5 : f >= 0.72 ? 4 : f >= 0.42 ? 3 : f >= 0.16 ? 2 : 1);

const SOIL = '#7a5230', SOIL_L = '#9a6a3c';

export function soilGeometry(locked: boolean): THREE.BufferGeometry {
  const k = new Kit();
  if (locked) {
    k.box(1.8, 0.06, 1.8, '#8fb35a', { p: [1, 0.03, 1], jitter: 0.1 }, 0.05);
    for (let i = 0; i < 4; i++) k.box(0.06, 0.3, 0.06, '#c9a46e', { p: [i % 2 ? 1.75 : 0.25, 0.15, i < 2 ? 0.25 : 1.75] }, 0.01);
    k.box(0.07, 0.6, 0.07, '#8d5a33', { p: [1, 0.3, 1.2] }, 0.01);
    k.box(0.42, 0.32, 0.05, '#f3d9a8', { p: [1, 0.62, 1.22] }, 0.03);
    k.box(0.16, 0.12, 0.06, '#f0b53a', { p: [1, 0.58, 1.26] }, 0.02);
    k.torus(0.05, 0.015, '#5b4636', { p: [1, 0.66, 1.26] }, Math.PI);
    return k.build();
  }
  k.box(1.86, 0.16, 1.86, SOIL_L, { p: [1, 0.08, 1], jitter: 0.08 }, 0.06);
  for (let r = 0; r < 3; r++) k.box(1.6, 0.12, 0.42, SOIL, { p: [1, 0.17, 0.4 + r * 0.6], jitter: 0.14 }, 0.06);
  // borda de madeira
  for (const [x, z, w, d] of [[1, 0.04, 1.96, 0.08], [1, 1.96, 1.96, 0.08], [0.04, 1, 0.08, 1.96], [1.96, 1, 0.08, 1.96]] as const) k.box(w, 0.2, d, '#a8713f', { p: [x, 0.1, z] }, 0.02);
  return k.build();
}

type Painter = (k: Kit, x: number, z: number, s: number, ripe: 0 | 1 | 2, r: () => number) => void;
const LEAF = '#6fb043';
const leaf = (k: Kit, x: number, y: number, z: number, len: number, ang: number, rot: number, col = LEAF) =>
  k.box(len * 0.35, 0.015, len, col, { p: [x + Math.sin(rot) * len * 0.4, y, z + Math.cos(rot) * len * 0.4], r: [ang, rot, 0], wind: 1 }, 0.004);

const P: Record<string, Painter> = {
  wheat(k, x, z, s, ripe) {
    const col = ripe === 2 ? '#e9c34e' : ripe === 1 ? '#c6c95a' : '#86c04c';
    for (let i = 0; i < 6; i++) { const a = i * 1.05, d = 0.05; const h = (0.45 + (i % 3) * 0.06) * s;
      k.cyl(0.008, 0.01, h, tint(col, -0.1), { p: [x + Math.cos(a) * d, h / 2, z + Math.sin(a) * d], r: [Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15], wind: 1.6 }, 4);
      if (ripe) k.capsule(0.022, 0.07 * s, col, { p: [x + Math.cos(a) * d * 1.8, h, z + Math.sin(a) * d * 1.8], wind: 1.6 }); }
  },
  carrot(k, x, z, s, ripe) {
    if (ripe === 2) k.cone(0.06, 0.12, '#f28a24', { p: [x, 0.04, z], r: [Math.PI, 0, 0] }, 7);
    for (let i = 0; i < 5; i++) { const a = i * 1.26; k.cone(0.025, 0.3 * s, '#79bb4a', { p: [x + Math.cos(a) * 0.04, 0.15 * s, z + Math.sin(a) * 0.04], r: [Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4], wind: 1.5 }, 4); }
  },
  corn(k, x, z, s, ripe) {
    const h = 0.9 * s;
    k.cyl(0.025, 0.035, h, '#7aae44', { p: [x, h / 2, z], wind: 0.8 }, 6);
    for (let i = 0; i < 4; i++) leaf(k, x, h * (0.3 + i * 0.17), z, 0.32 * s, 0.5, i * 1.6, '#86bd4c');
    if (ripe) { k.capsule(0.045, 0.12 * s, ripe === 2 ? '#f6cf3e' : '#b9d468', { p: [x + 0.06, h * 0.55, z + 0.02], r: [0, 0, -0.3], wind: 0.8 }); k.cone(0.05, 0.12, '#a5cf62', { p: [x + 0.07, h * 0.45, z + 0.02], r: [Math.PI, 0, 0.3], wind: 0.8 }, 6); }
    for (let i = 0; i < 3; i++) k.cyl(0.006, 0.006, 0.12, ripe === 2 ? '#c99a3c' : '#a8c25a', { p: [x + (i - 1) * 0.03, h + 0.05, z], r: [0, 0, (i - 1) * 0.4], wind: 0.8 }, 3);
  },
  tomato(k, x, z, s, ripe, r) {
    k.box(0.025, 0.55 * s, 0.025, '#b9824e', { p: [x + 0.09, 0.27 * s, z] }, 0.005);
    for (let i = 0; i < 4; i++) k.ico(0.11 * s, i % 2 ? '#5d9e3a' : LEAF, { p: [x + (r() - 0.5) * 0.12, (0.15 + i * 0.1) * s, z + (r() - 0.5) * 0.12], wind: 0.8 }, 0);
    if (ripe) for (let i = 0; i < 4; i++) k.sphere(0.045, ripe === 2 ? '#e3473e' : '#9fca58', { p: [x + (r() - 0.5) * 0.2, (0.12 + r() * 0.3) * s, z + 0.08], wind: 0.8 }, 7, 5);
  },
  potato(k, x, z, s, ripe, r) {
    if (ripe === 2) for (let i = 0; i < 2; i++) k.ico(0.05, '#d3a96c', { p: [x + (i ? 0.1 : -0.1), 0.03, z + 0.05] }, 0);
    for (let i = 0; i < 5; i++) leaf(k, x, 0.1 * s + r() * 0.05, z, 0.2 * s, 0.7, i * 1.26, i % 2 ? LEAF : '#7dbd52');
    if (ripe) for (let i = 0; i < 3; i++) k.sphere(0.025, ripe === 2 ? '#f7f2ff' : '#dcecc4', { p: [x + (r() - 0.5) * 0.12, 0.2 * s, z + (r() - 0.5) * 0.12], wind: 1 }, 5, 4);
  },
  cotton(k, x, z, s, ripe, r) {
    k.cyl(0.012, 0.016, 0.42 * s, '#7a6a3a', { p: [x, 0.21 * s, z], wind: 0.8 }, 5);
    for (let i = 0; i < 3; i++) leaf(k, x, (0.15 + i * 0.08) * s, z, 0.16 * s, 0.6, i * 2.1, '#5d9e3a');
    if (ripe) for (let i = 0; i < 3; i++) k.ico(ripe === 2 ? 0.055 : 0.035, ripe === 2 ? '#fbfaf4' : '#8fbf5a', { p: [x + (r() - 0.5) * 0.16, (0.32 + r() * 0.12) * s, z + (r() - 0.5) * 0.16], wind: 0.8 }, 1);
  },
  strawberry(k, x, z, s, ripe, r) {
    for (let i = 0; i < 6; i++) leaf(k, x, 0.05 * s, z, 0.16 * s, 1.2, i * 1.05, i % 2 ? '#5fa63c' : LEAF);
    if (ripe) for (let i = 0; i < 3; i++) k.cone(0.035, 0.06, ripe === 2 ? '#e5394f' : '#e8e4a0', { p: [x + (r() - 0.5) * 0.2, 0.05, z + 0.08 + r() * 0.05], r: [Math.PI, 0, 0] }, 6);
  },
  sunflower(k, x, z, s, ripe) {
    const h = 0.95 * s;
    k.cyl(0.022, 0.03, h, '#6fa53c', { p: [x, h / 2, z], wind: 0.7 }, 6);
    leaf(k, x, h * 0.35, z, 0.22 * s, 0.6, 0.5); leaf(k, x, h * 0.55, z, 0.2 * s, 0.6, 3.4);
    if (ripe === 2) { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; k.box(0.05, 0.1, 0.012, '#f9c932', { p: [x + Math.cos(a) * 0.1, h + Math.sin(a) * 0.1, z + 0.07], r: [0, 0, a - Math.PI / 2], wind: 0.7 }, 0.004); } k.cyl(0.07, 0.07, 0.03, '#7a4a22', { p: [x, h, z + 0.08], r: [Math.PI / 2 - 0.3, 0, 0], wind: 0.7 }, 10); }
    else if (ripe === 1) k.sphere(0.06, '#8fbf4a', { p: [x, h, z + 0.04], wind: 0.7 }, 8, 6);
  },
  grape(k, x, z, s, ripe, r) {
    for (const dx of [-0.12, 0.12]) k.box(0.025, 0.6 * s, 0.025, '#a7764a', { p: [x + dx, 0.3 * s, z] }, 0.005);
    k.box(0.3, 0.025, 0.025, '#b9824e', { p: [x, 0.58 * s, z] }, 0.005);
    for (let i = 0; i < 4; i++) k.ico(0.09 * s, '#6aa843', { p: [x + (r() - 0.5) * 0.24, (0.42 + r() * 0.16) * s, z + (r() - 0.5) * 0.1], wind: 0.6 }, 0);
    if (ripe) for (const dx of [-0.07, 0.08]) for (let j = 0; j < 5; j++) k.sphere(0.022, ripe === 2 ? '#7d3fa6' : '#a8cd6a', { p: [x + dx + (j % 2) * 0.02, (0.4 - Math.floor(j / 2) * 0.035) * s, z + 0.07], wind: 0.6 }, 5, 4);
  },
  rose(k, x, z, s, ripe, r) {
    for (let i = 0; i < 4; i++) k.ico(0.09 * s, i % 2 ? '#4f8f36' : '#5d9e3a', { p: [x + (r() - 0.5) * 0.12, (0.12 + i * 0.07) * s, z + (r() - 0.5) * 0.12], wind: 0.8 }, 0);
    if (ripe) for (let i = 0; i < 3; i++) k.ico(ripe === 2 ? 0.05 : 0.03, ripe === 2 ? '#e2386a' : '#d24a72', { p: [x + (r() - 0.5) * 0.2, (0.28 + r() * 0.12) * s, z + (r() - 0.5) * 0.2], wind: 0.8 }, 1);
  },
  pumpkin(k, x, z, s, ripe) {
    for (let i = 0; i < 5; i++) leaf(k, x, 0.06, z, 0.3 * s, 1.35, i * 1.26, '#64a83f');
    if (ripe) { const rr = (ripe === 2 ? 0.22 : 0.12) * s; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.sphere(rr * 0.6, ripe === 2 ? '#f28a26' : '#b5cd5a', { p: [x + Math.cos(a) * rr * 0.42, rr * 0.75, z + 0.12 + Math.sin(a) * rr * 0.42], s: [0.8, 1, 0.8] }, 8, 6); } k.cyl(0.02, 0.025, 0.08, '#7a5230', { p: [x, rr * 1.5, z + 0.12] }, 5); }
  },
  tulip(k, x, z, s, ripe) {
    for (const [dx, h] of [[-0.06, 0.32], [0.05, 0.38], [0, 0.3]] as const) {
      k.cyl(0.008, 0.01, h * s, '#6aa840', { p: [x + dx, h * s / 2, z], wind: 1.2 }, 4);
      if (ripe === 2) k.lathe([[0, 0], [0.035, 0.02], [0.04, 0.08], [0.03, 0.09]], '#ff7a4a', { p: [x + dx, h * s, z], wind: 1.2 }, 6);
      else if (ripe === 1) k.capsule(0.018, 0.03, '#a9cf68', { p: [x + dx, h * s + 0.02, z], wind: 1.2 });
    }
    leaf(k, x, 0.06, z, 0.22 * s, 1.0, 0.4, '#7dbd52'); leaf(k, x, 0.06, z, 0.2 * s, 1.0, 3.5);
  },
  oat(k, x, z, s, ripe) {
    const col = ripe === 2 ? '#d9c38a' : ripe === 1 ? '#c2c27a' : '#8cc35a';
    for (let i = 0; i < 7; i++) { const a = i * 0.9, h = (0.4 + (i % 3) * 0.05) * s;
      k.cyl(0.006, 0.008, h, '#9bb85a', { p: [x + Math.cos(a) * 0.05, h / 2, z + Math.sin(a) * 0.05], r: [Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2], wind: 1.7 }, 3);
      if (ripe) for (let j = 0; j < 3; j++) k.sphere(0.018, col, { p: [x + Math.cos(a) * 0.08 + j * 0.015, h - j * 0.05, z + Math.sin(a) * 0.08], wind: 1.7 }, 5, 4); }
  },
  cassava(k, x, z, s, ripe) {
    const h = 0.6 * s;
    k.cyl(0.02, 0.025, h, '#8d6e63', { p: [x, h / 2, z], wind: 0.6 }, 5);
    for (let i = 0; i < 5; i++) { const a = i * 1.26; for (let j = 0; j < 5; j++) k.box(0.025, 0.01, 0.13, ripe === 2 ? '#5d9e3a' : '#7cb342', { p: [x + Math.cos(a) * 0.08, h - 0.04, z + Math.sin(a) * 0.08], r: [0.4, a + (j - 2) * 0.35, 0], wind: 1.2 }, 0.003); }
    if (ripe === 2) for (let i = 0; i < 3; i++) k.capsule(0.025, 0.1, '#d7b98e', { p: [x + (i - 1) * 0.06, 0.03, z + 0.05], r: [Math.PI / 2, 0, (i - 1) * 0.5] });
  },
  sugarcane(k, x, z, s, ripe) {
    for (let i = 0; i < 3; i++) { const h = (0.85 + i * 0.1) * s, xx = x + (i - 1) * 0.06;
      k.cyl(0.02, 0.022, h, ripe === 2 ? '#c5b35a' : '#8fbf4a', { p: [xx, h / 2, z], wind: 0.5 }, 6);
      for (let y = 0.2; y < h; y += 0.22) k.cyl(0.025, 0.025, 0.015, '#6f8f3a', { p: [xx, y, z] }, 6);
      for (let j = 0; j < 2; j++) leaf(k, xx, h - j * 0.1, z, 0.35 * s, 0.6, i * 2 + j * 3, '#7cb342'); }
  },
  coffee(k, x, z, s, ripe, r) {
    for (let i = 0; i < 5; i++) k.ico(0.12 * s, i % 2 ? '#2e7d32' : '#388e3c', { p: [x + (r() - 0.5) * 0.12, (0.18 + i * 0.09) * s, z + (r() - 0.5) * 0.12], wind: 0.6 }, 0);
    if (ripe) for (let i = 0; i < 8; i++) k.sphere(0.025, ripe === 2 ? '#c0392b' : '#8bc34a', { p: [x + (r() - 0.5) * 0.24, (0.15 + r() * 0.4) * s, z + 0.1], wind: 0.6 }, 5, 4);
  },
  erva_mate(k, x, z, s, ripe, r) {
    k.cyl(0.02, 0.03, 0.3 * s, '#6d4c41', { p: [x, 0.15 * s, z] }, 5);
    for (let i = 0; i < 6; i++) k.ico(0.1 * s, ripe === 2 ? '#4f7d1f' : '#6b8e23', { p: [x + (r() - 0.5) * 0.14, (0.3 + i * 0.06) * s, z + (r() - 0.5) * 0.14], wind: 0.7 }, 0);
  },
  lavender(k, x, z, s, ripe) {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const h = (0.35 + (i % 2) * 0.06) * s;
      k.cyl(0.006, 0.008, h, '#7a9a6a', { p: [x + Math.cos(a) * 0.05, h / 2, z + Math.sin(a) * 0.05], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], wind: 1.4 }, 3);
      if (ripe) k.capsule(0.02, 0.08, ripe === 2 ? '#9370d0' : '#9cb88a', { p: [x + Math.cos(a) * 0.12, h, z + Math.sin(a) * 0.12], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3], wind: 1.4 }); }
  },
};

const cache = new Map<string, THREE.BufferGeometry>();
/** Geometria de um estágio (1..5) de uma cultura, cobrindo o canteiro inteiro. */
export function cropGeometry(crop: string, s: number): THREE.BufferGeometry {
  const key = `${crop}:${s}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const k = new Kit();
  const r = rng(crop.length * 31 + s);
  const slots: [number, number][] = crop === 'pumpkin' ? [[0.55, 0.5], [1.45, 0.55], [0.5, 1.45], [1.5, 1.5]] : [0, 1, 2].flatMap((row) => [0, 1, 2].map((c) => [0.4 + c * 0.6 + (row % 2 ? 0.06 : -0.04), 0.4 + row * 0.6] as [number, number]));
  for (const [x, z] of slots) {
    const y0 = 0.22;
    const sub = new Kit();
    if (s <= 1) { sub.sphere(0.09, SOIL_L, { p: [0, 0, 0], s: [1, 0.4, 0.8] }, 8, 5); for (let i = 0; i < 3; i++) sub.sphere(0.018, '#f1dca3', { p: [(i - 1) * 0.04, 0.03, 0.02] }, 5, 4); }
    else if (s === 2) { sub.cyl(0.008, 0.01, 0.1, '#6aa840', { p: [0, 0.05, 0], wind: 1 }, 4); for (const a of [0.6, -0.6]) sub.box(0.05, 0.012, 0.09, '#79bb4a', { p: [Math.sin(a) * 0.05, 0.1, 0], r: [0, Math.PI / 2, a], wind: 1 }, 0.004); }
    else P[crop](sub, 0, 0, s === 3 ? 0.55 : s === 4 ? 0.92 : 1, s === 3 ? 0 : s === 4 ? 1 : 2, r);
    k.addBuilt(sub.build(), { p: [x + (r() - 0.5) * 0.05, y0, z + (r() - 0.5) * 0.05], r: [0, r() * 0.6, 0] });
  }
  const g = k.build();
  cache.set(key, g);
  return g;
}
