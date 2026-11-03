// Canteiros e plantações (top-down 3/4). Um canteiro ocupa 2×2 tiles = 64 px de mundo (128 a 2×).
// Estágios: 0 solo preparado · 1 semente · 2 broto · 3 crescendo · 4 adulta · 5 pronta.
import { CROPS } from '../../../data/catalog.ts';
import { cv, ell, fillOut, rr, shadow, shine, sphere, vol, shade, OUT, type Ctx } from './paint.ts';
import { mulberry } from '../draw.ts';
import type { Art } from './nature.ts';

export const PLOT = 128;        // px do canteiro a 2×
const TOP = 60, SIDE = 6;       // folga acima (plantas altas) e nas laterais
const W = PLOT + SIDE * 2, H = PLOT + TOP + 8;

export const STAGES = 6;
/** Estágio visual a partir da fração de crescimento (0..1+). */
export const stageOf = (f: number) => (f >= 1 ? 5 : f >= 0.72 ? 4 : f >= 0.42 ? 3 : f >= 0.16 ? 2 : 1);

const at = (c: HTMLCanvasElement): Art => ({ c, ox: SIDE / W, oy: TOP / H });

function soilBase(x: Ctx, locked: boolean) {
  const L = SIDE, T = TOP;
  shadow(x, L + PLOT / 2 + 4, T + PLOT - 2, PLOT * 0.55, 14, 0.22);
  if (locked) {
    rr(x, L + 4, T + 4, PLOT - 8, PLOT - 8, 18);
    fillOut(x, vol(x, L, T, L + PLOT, T + PLOT, '#8fb35a', 0.1, -0.12), 2, shade('#8fb35a', -0.4));
    x.setLineDash([7, 7]); x.lineWidth = 2.4; x.strokeStyle = 'rgba(255,255,255,.55)';
    rr(x, L + 10, T + 10, PLOT - 20, PLOT - 20, 14); x.stroke(); x.setLineDash([]);
    const rnd = mulberry(9);
    for (let i = 0; i < 14; i++) {
      const gx = L + 18 + rnd() * (PLOT - 36), gy = T + 22 + rnd() * (PLOT - 40);
      for (const a of [-0.5, 0, 0.5]) { x.beginPath(); x.moveTo(gx, gy); x.quadraticCurveTo(gx + a * 8, gy - 6, gx + a * 10, gy - 11); x.lineWidth = 2; x.strokeStyle = shade('#6f9a3e', -0.1 + rnd() * 0.1); x.stroke(); }
    }
    // placa de cadeado
    const cx = L + PLOT / 2, cy = T + PLOT / 2 + 6;
    rr(x, cx - 3, cy - 4, 6, 24, 2); fillOut(x, '#8d5a33', 1.8);
    rr(x, cx - 18, cy - 26, 36, 26, 6); fillOut(x, vol(x, cx - 18, cy - 26, cx + 18, cy, '#f4e2bd'), 2);
    x.beginPath(); x.arc(cx, cy - 15, 5, Math.PI, 0); x.lineWidth = 2.6; x.strokeStyle = OUT; x.stroke();
    rr(x, cx - 7, cy - 15, 14, 10, 2.5); fillOut(x, '#f0b53a', 1.6);
    return;
  }
  // borda de terra fofa
  rr(x, L, T, PLOT, PLOT, 20);
  fillOut(x, vol(x, L, T, L + PLOT, T + PLOT, '#9a6a3c', 0.08, -0.2), 2.2);
  rr(x, L + 6, T + 5, PLOT - 12, PLOT - 12, 16);
  fillOut(x, vol(x, L, T, L + PLOT, T + PLOT, '#7a5230', 0.12, -0.18), 0);
  // sulcos horizontais (três fileiras)
  x.save(); rr(x, L + 6, T + 5, PLOT - 12, PLOT - 12, 16); x.clip();
  for (let r = 0; r < 3; r++) {
    const y = T + 18 + r * 40;
    const g = x.createLinearGradient(0, y - 12, 0, y + 14);
    g.addColorStop(0, shade('#8d6038', 0.12)); g.addColorStop(0.5, '#8d6038'); g.addColorStop(1, shade('#5e3d22', -0.05));
    rr(x, L + 12, y - 10, PLOT - 24, 26, 12); x.fillStyle = g; x.fill();
    x.strokeStyle = 'rgba(255,230,190,.28)'; x.lineWidth = 2; x.beginPath(); x.moveTo(L + 20, y - 7); x.lineTo(L + PLOT - 20, y - 7); x.stroke();
    x.strokeStyle = 'rgba(40,22,10,.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(L + 18, y + 15); x.lineTo(L + PLOT - 18, y + 15); x.stroke();
  }
  const rnd = mulberry(3);
  for (let i = 0; i < 26; i++) { ell(x, L + 12 + rnd() * (PLOT - 24), T + 10 + rnd() * (PLOT - 20), 1.6 + rnd() * 1.6, 1.2 + rnd()); x.fillStyle = rnd() < 0.5 ? 'rgba(60,35,18,.5)' : 'rgba(200,160,110,.45)'; x.fill(); }
  x.restore();
}

/** Canteiro vazio (estágio 0) e bloqueado. */
export function soilArt(locked: boolean): Art {
  const { c, x } = cv(W, H);
  soilBase(x, locked);
  return at(c);
}

// ------------------------------------------------------------ peças de planta
function leafPath(x: Ctx, cx: number, cy: number, len: number, w: number, ang: number) {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  x.beginPath(); x.moveTo(0, 0);
  x.quadraticCurveTo(w, -len * 0.45, 0, -len);
  x.quadraticCurveTo(-w, -len * 0.45, 0, 0);
  x.restore();
}
function leaf(x: Ctx, cx: number, cy: number, len: number, w: number, ang: number, col: string, lw = 1.8) {
  leafPath(x, cx, cy, len, w, ang);
  const g = x.createLinearGradient(cx - len * 0.5, cy - len, cx + len * 0.5, cy);
  g.addColorStop(0, shade(col, 0.25)); g.addColorStop(1, shade(col, -0.2));
  fillOut(x, g, lw);
  // nervura
  x.save(); x.translate(cx, cy); x.rotate(ang); x.beginPath(); x.moveTo(0, -2); x.lineTo(0, -len * 0.82);
  x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1.2; x.stroke(); x.restore();
}
function stem(x: Ctx, x0: number, y0: number, x1: number, y1: number, col = '#5f9a3a', w = 4) {
  x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(x0 + (x1 - x0) * 0.2, (y0 + y1) / 2, x1, y1);
  x.lineWidth = w + 2.6; x.strokeStyle = OUT; x.stroke();
  x.lineWidth = w; x.strokeStyle = col; x.stroke();
}
function berry(x: Ctx, cx: number, cy: number, r: number, col: string, lw = 1.6) {
  ell(x, cx, cy, r, r); fillOut(x, sphere(x, cx, cy, r, col), lw); shine(x, cx - r * 0.35, cy - r * 0.4, r * 0.3, r * 0.2, 0.55);
}
function moundShadow(x: Ctx, cx: number, cy: number, r: number) { shadow(x, cx + 2, cy + 1, r, r * 0.38, 0.3); }

const LEAF = '#6fb043';

type Painter = (x: Ctx, cx: number, cy: number, k: number, ripe: 0 | 1 | 2, rnd: () => number) => void;

const P: Record<string, Painter> = {
  wheat(x, cx, cy, k, ripe) {
    const col = ripe === 2 ? '#e9c34e' : ripe === 1 ? '#c6c95a' : '#86c04c';
    moundShadow(x, cx, cy, 16 * k);
    for (let i = -3; i <= 3; i++) {
      const tx = cx + i * 3.2 * k, ty = cy - (36 + (3 - Math.abs(i)) * 5) * k;
      stem(x, cx + i * 1.5, cy, tx, ty, shade(col, -0.1), 2.4);
      if (ripe) {
        for (let j = 0; j < 4; j++) { ell(x, tx + (j % 2 ? 2.2 : -2.2), ty + 3 + j * 4.2 * k, 2.8 * k, 4 * k, j % 2 ? 0.5 : -0.5); fillOut(x, shade(col, 0.1 - j * 0.04), 1.3); }
        x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx + i, ty - 9 * k); x.lineWidth = 1.2; x.strokeStyle = shade(col, -0.25); x.stroke();
      }
    }
    leaf(x, cx - 2, cy, 18 * k, 4, -0.7, LEAF, 1.5); leaf(x, cx + 2, cy, 16 * k, 4, 0.75, LEAF, 1.5);
  },
  carrot(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 15 * k);
    if (ripe === 2) { x.beginPath(); x.moveTo(cx - 9, cy - 4); x.quadraticCurveTo(cx, cy - 12, cx + 9, cy - 4); x.quadraticCurveTo(cx + 4, cy + 6, cx, cy + 6); x.quadraticCurveTo(cx - 4, cy + 6, cx - 9, cy - 4); fillOut(x, vol(x, cx - 9, cy - 10, cx + 9, cy + 6, '#f28a24'), 1.8); x.strokeStyle = 'rgba(120,50,10,.4)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(cx - 5, cy - 2); x.lineTo(cx - 1, cy - 2); x.moveTo(cx + 1, cy + 2); x.lineTo(cx + 5, cy + 2); x.stroke(); }
    for (const [a, l] of [[-0.9, 22], [-0.45, 28], [0, 32], [0.45, 28], [0.9, 22]] as const) {
      const ex = cx + Math.sin(a) * l * k, ey = cy - 6 - Math.cos(a) * l * k;
      stem(x, cx, cy - 6, ex, ey, '#5f9a3a', 2);
      for (let j = 1; j <= 3; j++) { const t = j / 3.4; leaf(x, cx + (ex - cx) * t, cy - 6 + (ey - cy + 6) * t, 8 * k, 4, a + (j % 2 ? 0.8 : -0.8), '#79bb4a', 1.2); }
    }
  },
  corn(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 14 * k);
    const top = cy - 66 * k;
    stem(x, cx, cy, cx + 1, top, '#7aae44', 5);
    for (const [y, a, l] of [[0.25, -1, 30], [0.4, 1, 32], [0.6, -1, 26], [0.75, 1, 22]] as const) {
      leafPath(x, cx, cy - (cy - top) * y, l * k, 6, a * 1.05); fillOut(x, vol(x, cx - 20, top, cx + 20, cy, '#86bd4c'), 1.6);
    }
    if (ripe) {
      const ey = cy - (cy - top) * 0.52;
      ell(x, cx + 7, ey, 5.5 * k, 13 * k, 0.35); fillOut(x, ripe === 2 ? sphere(x, cx + 7, ey, 12, '#f6cf3e') : '#b9d468', 1.6);
      if (ripe === 2) for (let j = -2; j <= 2; j++) { ell(x, cx + 7 + j * 1.4, ey + j * 4, 1.4, 1.2); x.fillStyle = 'rgba(160,100,10,.4)'; x.fill(); }
      leafPath(x, cx + 3, ey + 12, 20 * k, 5, 0.25); fillOut(x, '#a5cf62', 1.4);
    }
    // pendão
    for (const a of [-0.5, 0, 0.5]) { x.beginPath(); x.moveTo(cx + 1, top); x.lineTo(cx + 1 + a * 12, top - 9); x.lineWidth = 2; x.strokeStyle = ripe === 2 ? '#c99a3c' : '#a8c25a'; x.stroke(); }
  },
  tomato(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 16 * k);
    rr(x, cx + 8, cy - 50 * k, 4, 50 * k, 2); fillOut(x, '#b9824e', 1.4); // estaca
    for (const [dx, dy, r] of [[-8, 18, 13], [8, 22, 12], [0, 34, 14], [-6, 44, 10], [6, 46, 9]] as const) {
      ell(x, cx + dx * k, cy - dy * k, r * k, r * 0.85 * k); fillOut(x, sphere(x, cx + dx * k, cy - dy * k, r * k, dy > 30 ? '#6fb043' : '#5d9e3a'), 1.6);
    }
    if (ripe) for (const [dx, dy] of [[-9, 16], [7, 24], [-2, 36], [9, 40]] as const) {
      berry(x, cx + dx * k, cy - dy * k, 5.5 * k, ripe === 2 ? '#e3473e' : '#9fca58');
      leaf(x, cx + dx * k, cy - dy * k - 4, 4, 2, 0, '#3f7f2d', 1);
    }
  },
  potato(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 18 * k);
    if (ripe === 2) for (const [dx, dy] of [[-10, 3], [9, 4]] as const) { ell(x, cx + dx, cy + dy, 7, 5); fillOut(x, sphere(x, cx + dx, cy + dy, 7, '#d3a96c'), 1.6); }
    for (let i = 0; i < 7; i++) { const a = -1.3 + (i / 6) * 2.6; leaf(x, cx, cy - 4, (18 + (i % 2) * 6) * k, 7, a, i % 2 ? LEAF : '#7dbd52', 1.6); }
    if (ripe) for (const [dx, dy] of [[-6, 24], [6, 20], [0, 28]] as const) {
      for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; ell(x, cx + dx * k + Math.cos(a) * 2.6, cy - dy * k + Math.sin(a) * 2.6, 2.2, 2.2); fillOut(x, ripe === 2 ? '#f7f2ff' : '#dcecc4', 0.8); }
      ell(x, cx + dx * k, cy - dy * k, 1.4, 1.4); x.fillStyle = '#f2c230'; x.fill();
    }
  },
  cotton(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 15 * k);
    stem(x, cx, cy, cx, cy - 34 * k, '#7a6a3a', 3);
    stem(x, cx, cy - 12 * k, cx - 12 * k, cy - 30 * k, '#7a6a3a', 2.4);
    stem(x, cx, cy - 16 * k, cx + 12 * k, cy - 32 * k, '#7a6a3a', 2.4);
    for (const [dx, dy, a] of [[-8, 14, -0.9], [8, 18, 0.9], [-4, 28, -0.4], [5, 30, 0.5]] as const) leaf(x, cx + dx * k, cy - dy * k, 13 * k, 6, a, '#5d9e3a', 1.4);
    if (ripe) for (const [dx, dy] of [[0, 38], [-13, 33], [13, 35]] as const) {
      if (ripe === 2) { for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 2]]) { ell(x, cx + dx * k + ox, cy - dy * k + oy, 5, 4.5); fillOut(x, sphere(x, cx + dx * k + ox, cy - dy * k + oy, 5, '#fbfaf4'), 1.2); } }
      else { ell(x, cx + dx * k, cy - dy * k, 4, 5); fillOut(x, '#8fbf5a', 1.4); }
    }
  },
  strawberry(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 17 * k);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3, lx = cx + Math.cos(a) * 9 * k, ly = cy - 8 * k + Math.sin(a) * 5 * k;
      for (const o of [-0.5, 0, 0.5]) leaf(x, lx, ly + 3, 9 * k, 5, a + Math.PI / 2 + o, i % 2 ? '#5fa63c' : '#6fb043', 1.3);
    }
    if (ripe) for (const [dx, dy] of [[-11, 0], [10, -3], [0, 4], [3, -14]] as const) {
      const bx = cx + dx * k, by = cy + dy * k;
      x.beginPath(); x.moveTo(bx - 5, by - 3); x.quadraticCurveTo(bx, by - 6, bx + 5, by - 3); x.quadraticCurveTo(bx + 3, by + 6, bx, by + 7); x.quadraticCurveTo(bx - 3, by + 6, bx - 5, by - 3);
      fillOut(x, ripe === 2 ? sphere(x, bx, by, 7, '#e5394f') : '#e8e4a0', 1.4);
      x.fillStyle = 'rgba(255,240,160,.8)'; for (const [sx, sy] of [[-2, 0], [2, 1], [0, 3]]) { ell(x, bx + sx, by + sy, 0.8, 1); x.fill(); }
      leaf(x, bx - 2, by - 3, 4, 2, -0.8, '#3f7f2d', 1); leaf(x, bx + 2, by - 3, 4, 2, 0.8, '#3f7f2d', 1);
    }
  },
  sunflower(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 13 * k);
    const hy = cy - 70 * k;
    stem(x, cx, cy, cx - 2, hy + 6, '#6fa53c', 5);
    leaf(x, cx, cy - 22 * k, 22 * k, 10, -1.1, LEAF, 1.6); leaf(x, cx, cy - 34 * k, 20 * k, 9, 1.1, '#7dbd52', 1.6);
    if (ripe === 2) {
      for (let p = 0; p < 14; p++) { const a = (p / 14) * Math.PI * 2; leaf(x, cx - 2 + Math.cos(a) * 6, hy + Math.sin(a) * 5, 13, 5, a + Math.PI / 2, '#f9c932', 1.3); }
      ell(x, cx - 2, hy, 9, 8); fillOut(x, sphere(x, cx - 2, hy, 9, '#7a4a22'), 1.6);
      x.fillStyle = 'rgba(40,20,5,.45)'; for (let d = 0; d < 9; d++) { ell(x, cx - 2 + Math.cos(d * 2.4) * (d * 0.8), hy + Math.sin(d * 2.4) * (d * 0.7), 1, 1); x.fill(); }
    } else if (ripe === 1) { ell(x, cx - 2, hy, 7, 8); fillOut(x, sphere(x, cx - 2, hy, 8, '#8fbf4a'), 1.6); for (let p = 0; p < 6; p++) leaf(x, cx - 2, hy + 6, 9, 3, -1.2 + p * 0.48, '#e9c444', 1); }
    else { ell(x, cx - 2, hy + 4, 5, 6); fillOut(x, '#8fbf4a', 1.4); }
  },
  grape(x, cx, cy, k, ripe) {
    // treliça
    for (const dx of [-16, 16]) { rr(x, cx + dx - 2, cy - 56 * k, 4, 56 * k, 2); fillOut(x, '#a7764a', 1.4); }
    rr(x, cx - 20, cy - 52 * k, 40, 4, 2); fillOut(x, '#b9824e', 1.4);
    moundShadow(x, cx, cy, 18 * k);
    stem(x, cx, cy, cx - 4, cy - 46 * k, '#8a5a35', 3.4);
    for (const [dx, dy, a] of [[-14, 46, -0.6], [0, 54, 0], [14, 46, 0.6], [-8, 34, -1], [10, 36, 1]] as const) {
      leafPath(x, cx + dx * k, cy - dy * k + 8, 16 * k, 10, a); fillOut(x, vol(x, cx - 16, cy - 60, cx + 16, cy, '#6aa843'), 1.5);
    }
    if (ripe) for (const dx of [-11, 9]) {
      const gx = cx + dx * k, gy = cy - 30 * k;
      for (const [ox, oy] of [[-4, 0], [0, 0], [4, 0], [-2, 4], [2, 4], [0, 8]]) berry(x, gx + ox, gy + oy, 3.2, ripe === 2 ? '#7d3fa6' : '#a8cd6a', 1.1);
    }
  },
  rose(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 15 * k);
    for (const [dx, dy, a] of [[-10, 12, -1], [10, 14, 1], [-6, 26, -0.6], [7, 28, 0.7], [0, 20, 0], [0, 36, 0.1]] as const) leaf(x, cx + dx * k, cy - dy * k + 6, 12 * k, 6, a, dy > 24 ? '#4f8f36' : '#5d9e3a', 1.4);
    if (ripe) for (const [dx, dy] of [[-9, 26], [8, 30], [0, 40]] as const) {
      const rx = cx + dx * k, ry = cy - dy * k;
      if (ripe === 2) { for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; ell(x, rx + Math.cos(a) * 3.4, ry + Math.sin(a) * 3, 3.6, 3.4); fillOut(x, '#e2386a', 1.1); } ell(x, rx, ry, 3, 3); fillOut(x, sphere(x, rx, ry, 3, '#b81f4f'), 1); x.beginPath(); x.arc(rx, ry, 1.6, 0, 4); x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 1; x.stroke(); }
      else { ell(x, rx, ry, 3, 4.4); fillOut(x, '#d24a72', 1.2); leaf(x, rx, ry + 4, 5, 2, 0, '#4f8f36', 1); }
    }
  },
  pumpkin(x, cx, cy, k, ripe) {
    // vinha rasteira com folhas largas
    x.beginPath(); x.moveTo(cx - 26 * k, cy - 2); x.bezierCurveTo(cx - 8, cy - 14, cx + 8, cy + 8, cx + 26 * k, cy - 6);
    x.lineWidth = 5; x.strokeStyle = OUT; x.stroke(); x.lineWidth = 2.6; x.strokeStyle = '#6fa53c'; x.stroke();
    for (const [dx, dy] of [[-18, -4], [16, -6], [-4, -14], [24, 2], [-26, 4]] as const) {
      const lx = cx + dx * k, ly = cy + dy * k;
      for (const o of [-0.7, 0, 0.7]) leaf(x, lx, ly + 4, 12 * k, 8, o, '#64a83f', 1.4);
    }
    if (ripe) {
      const r = (ripe === 2 ? 15 : 9) * k, px = cx + 2, py = cy + 2;
      shadow(x, px + 2, py + r * 0.7, r * 1.1, r * 0.35, 0.3);
      for (const [ox, sx] of [[-r * 0.55, 0.62], [r * 0.55, 0.62], [0, 0.7]]) { ell(x, px + ox, py, r * sx, r * 0.82); fillOut(x, sphere(x, px + ox, py, r, ripe === 2 ? '#f28a26' : '#b5cd5a'), 1.7); }
      rr(x, px - 2, py - r * 0.95, 4, 7, 2); fillOut(x, '#7a5230', 1.4);
      shine(x, px - r * 0.3, py - r * 0.35, r * 0.22, r * 0.14, 0.5);
    }
  },
  tulip(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 12 * k);
    const col = '#ff7a4a';
    for (const [dx, h] of [[-8, 34], [0, 42], [8, 36]] as const) {
      const tx = cx + dx * k, ty = cy - h * k;
      stem(x, cx + dx * 0.4, cy, tx, ty, '#6aa840', 2.4);
      if (ripe === 2) { x.beginPath(); x.moveTo(tx - 6, ty - 9); x.lineTo(tx - 3, ty - 3); x.lineTo(tx, ty - 10); x.lineTo(tx + 3, ty - 3); x.lineTo(tx + 6, ty - 9); x.quadraticCurveTo(tx + 7, ty + 4, tx, ty + 4); x.quadraticCurveTo(tx - 7, ty + 4, tx - 6, ty - 9); fillOut(x, vol(x, tx - 6, ty - 10, tx + 6, ty + 4, col), 1.5); }
      else if (ripe === 1) { ell(x, tx, ty - 2, 3.4, 6); fillOut(x, '#a9cf68', 1.3); }
    }
    leaf(x, cx - 2, cy, 26 * k, 7, -0.35, '#7dbd52', 1.6); leaf(x, cx + 2, cy, 24 * k, 7, 0.4, LEAF, 1.6);
  },
  lavender(x, cx, cy, k, ripe) {
    moundShadow(x, cx, cy, 16 * k);
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.22, l = (30 + (3 - Math.abs(i)) * 5) * k;
      const ex = cx + Math.sin(a) * l, ey = cy - Math.cos(a) * l;
      stem(x, cx, cy, ex, ey, '#7a9a6a', 1.8);
      if (ripe) for (let j = 0; j < 5; j++) { const t = 1 - j * 0.09; ell(x, cx + (ex - cx) * t, cy + (ey - cy) * t, 2.6, 3.2, a); fillOut(x, ripe === 2 ? shade('#9370d0', -j * 0.04) : '#9cb88a', 0.9); }
    }
    for (const a of [-1, -0.5, 0.5, 1]) leaf(x, cx, cy, 14 * k, 3, a, '#8aa47a', 1.2);
  },
};

/** Fileiras: 3×3 plantas (abóbora: 2×2), desenhadas de trás para a frente. */
function slots(crop: string): [number, number][] {
  if (crop === 'pumpkin') return [[34, 46], [94, 50], [32, 106], [96, 108]];
  const out: [number, number][] = [];
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) out.push([22 + col * 42 + (r % 2 ? 4 : -2), 30 + r * 40]);
  return out;
}

function seeds(x: Ctx, cx: number, cy: number, rnd: () => number) {
  ell(x, cx, cy, 10, 5); fillOut(x, vol(x, cx - 10, cy - 5, cx + 10, cy + 5, '#8d6038', 0.15, -0.1), 1.6);
  for (let i = 0; i < 3; i++) { ell(x, cx - 4 + i * 4 + rnd() * 1.5, cy - 1 + rnd() * 2, 1.8, 1.3); x.fillStyle = '#f1dca3'; x.fill(); }
}
function sprout(x: Ctx, cx: number, cy: number, col: string) {
  moundShadow(x, cx, cy, 7);
  stem(x, cx, cy, cx, cy - 9, '#6aa840', 2.2);
  leaf(x, cx, cy - 7, 10, 5, -1.05, col, 1.5); leaf(x, cx, cy - 7, 10, 5, 1.05, shade(col, 0.08), 1.5);
}

/** Arte do estágio s (1..5) de uma cultura, desenhada sobre o canteiro. */
export function cropArt(crop: string, s: number): Art {
  const { c, x } = cv(W, H);
  const rnd = mulberry(crop.length * 31 + s);
  const leafCol = crop === 'lavender' ? '#8aa47a' : crop === 'cotton' ? '#5d9e3a' : '#79bb4a';
  for (const [px, py] of slots(crop)) {
    const cx = SIDE + px + (rnd() - 0.5) * 3, cy = TOP + py + (rnd() - 0.5) * 2;
    if (s <= 1) seeds(x, cx, cy, rnd);
    else if (s === 2) sprout(x, cx, cy, leafCol);
    else P[crop](x, cx, cy, s === 3 ? 0.58 : s === 4 ? 0.92 : 1, s === 3 ? 0 : s === 4 ? 1 : 2, rnd);
  }
  return at(c);
}

/** Todas as artes (folha de contato de QA). */
export function allCropArts(): Record<string, Art> {
  const out: Record<string, Art> = { soil: soilArt(false), locked: soilArt(true) };
  for (const cr of CROPS) for (let s = 1; s < STAGES; s++) out[`${cr.id}_${s}`] = composite(cr.id, s);
  return out;
}
function composite(crop: string, s: number): Art {
  const { c, x } = cv(W, H);
  x.drawImage(soilArt(false).c, 0, 0); x.drawImage(cropArt(crop, s).c, 0, 0);
  return at(c);
}
