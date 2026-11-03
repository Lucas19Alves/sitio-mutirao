// Natureza cartoon (a 2x): árvores, arbustos, rochas, minérios, cultivos silvestres e decoração.
// Cada arte tem origem (ox, oy) em 0..1 = ponto que fica no chão.
import { mulberry } from '../draw.ts';
import { cv, ell, rr, vol, sphere, fillOut, shadow, shine, blobPath, cluster, shade, OUT, LW, type Ctx } from './paint.ts';

export interface Art { c: HTMLCanvasElement; ox: number; oy: number }

function art(w: number, h: number, oy: number, draw: (x: Ctx) => void, ox = 0.5): Art {
  const { c, x } = cv(w, h);
  draw(x);
  return { c, ox, oy };
}

// ---------------------------------------------------------------- árvores
function trunk(x: Ctx, cx: number, top: number, bot: number, w: number, col = '#8d5a33') {
  x.beginPath();
  x.moveTo(cx - w * 0.5, bot); x.quadraticCurveTo(cx - w * 0.62, bot + 2, cx - w * 0.75, bot + 4);
  x.lineTo(cx - w * 0.36, top); x.lineTo(cx + w * 0.36, top);
  x.lineTo(cx + w * 0.75, bot + 4); x.quadraticCurveTo(cx + w * 0.62, bot + 2, cx + w * 0.5, bot);
  x.closePath();
  fillOut(x, vol(x, cx - w, top, cx + w, bot, col, 0.16, -0.3));
  x.strokeStyle = shade(col, -0.32); x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(cx - w * 0.12, top + 6); x.lineTo(cx - w * 0.18, bot - 4); x.moveTo(cx + w * 0.16, top + 10); x.lineTo(cx + w * 0.1, bot - 8); x.stroke();
}

/** Copa em três camadas: fundo escuro, meio, frente iluminada. */
function canopy(x: Ctx, cx: number, cy: number, r: number, col: string, seed: number, fruits?: string, pale = false) {
  const rnd = mulberry(seed);
  const lobes: { cx: number; cy: number; r: number }[] = [
    { cx: cx - r * 0.45, cy: cy + r * 0.18, r: r * 0.62 }, { cx: cx + r * 0.48, cy: cy + r * 0.2, r: r * 0.6 },
    { cx: cx - r * 0.1, cy: cy - r * 0.38, r: r * 0.66 }, { cx: cx + r * 0.08, cy: cy + r * 0.3, r: r * 0.66 },
    { cx: cx + r * 0.3, cy: cy - r * 0.18, r: r * 0.52 },
  ];
  const paths = lobes.map((l, i) => () => blobPath(x, l.cx, l.cy, l.r, 9, 0.18, mulberry(seed * 7 + i)));
  const g = sphere(x, cx, cy, r * 1.2, col);
  cluster(x, paths, [g]);
  // tufos de folhagem iluminada por cima
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * 0.7;
    blobPath(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8 - r * 0.15, r * (0.22 + rnd() * 0.12), 7, 0.25, mulberry(seed + i * 13));
    x.fillStyle = shade(col, pale ? 0.2 : 0.14 + rnd() * 0.08); x.globalAlpha = 0.55; x.fill(); x.globalAlpha = 1;
  }
  ell(x, cx + r * 0.1, cy + r * 0.62, r * 0.8, r * 0.22); x.fillStyle = 'rgba(20,50,20,.18)'; x.fill();
  shine(x, cx - r * 0.38, cy - r * 0.48, r * 0.24, r * 0.12, 0.28);
  // folhinhas desenhadas
  x.strokeStyle = shade(col, -0.25); x.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) { const px = cx + (rnd() - 0.5) * r * 1.5, py = cy + (rnd() - 0.4) * r * 1.1; x.beginPath(); x.arc(px, py, 3.5, 0.2, Math.PI - 0.2); x.stroke(); }
  if (fruits) for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd(), d = r * (0.35 + rnd() * 0.45);
    const fx = cx + Math.cos(a) * d, fy = cy + Math.sin(a) * d * 0.75;
    ell(x, fx, fy, 6.5, 6.5); fillOut(x, sphere(x, fx, fy, 6.5, fruits), 1.8);
    shine(x, fx - 2, fy - 2.4, 2, 1.4, 0.7);
    x.strokeStyle = '#4a7a2a'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(fx, fy - 6); x.lineTo(fx + 1.5, fy - 9); x.stroke();
  }
}

function oak(seed: number, col = '#5da443', fruits?: string, big = false): Art {
  const W = big ? 210 : 150, H = big ? 250 : 190;
  return art(W, H, 0.92, (x) => {
    const base = H * 0.92;
    shadow(x, W * 0.52, base - 2, W * 0.36, 13);
    trunk(x, W / 2, base - (big ? 92 : 70), base, big ? 34 : 24, big ? '#7a4a2a' : '#8d5a33');
    canopy(x, W / 2, base - (big ? 140 : 104), big ? 78 : 58, col, seed, fruits);
    if (big) { ell(x, W / 2 - 22, base - 40, 9, 5); x.fillStyle = 'rgba(120,170,80,.6)'; x.fill(); }
  });
}

function pine(seed: number, col = '#2f6b45'): Art {
  const W = 130, H = 220;
  return art(W, H, 0.93, (x) => {
    const base = H * 0.93, cx = W / 2;
    shadow(x, cx + 6, base - 2, 40, 11);
    trunk(x, cx, base - 34, base, 18, '#6b3f22');
    const tiers = [[base - 30, 52], [base - 72, 44], [base - 110, 34], [base - 142, 22]] as const;
    const rnd = mulberry(seed);
    x.lineWidth = LW * 2; x.strokeStyle = OUT;
    const tri = (y: number, w: number) => { x.beginPath(); x.moveTo(cx, y - w * 1.25); x.quadraticCurveTo(cx + w * 0.3, y - w * 0.4, cx + w, y); x.quadraticCurveTo(cx, y + 10, cx - w, y); x.quadraticCurveTo(cx - w * 0.3, y - w * 0.4, cx, y - w * 1.25); x.closePath(); };
    for (const [y, w] of tiers) { tri(y, w); x.stroke(); }
    for (const [y, w] of tiers) { tri(y, w); x.fillStyle = vol(x, cx - w, y - w, cx + w, y, col, 0.22, -0.2); x.fill(); x.strokeStyle = shade(col, -0.3); x.lineWidth = 1.4; for (let k = 0; k < 3; k++) { const px = cx - w * 0.6 + rnd() * w * 1.2; x.beginPath(); x.moveTo(px, y - 4); x.lineTo(px + 4, y - 10); x.stroke(); } }
    shine(x, cx - 10, base - 150, 6, 3, 0.25);
  });
}

function stump(big: boolean): Art {
  const W = big ? 110 : 84, H = 80;
  return art(W, H, 0.85, (x) => {
    const cx = W / 2, base = H * 0.85, w = big ? 40 : 30;
    shadow(x, cx + 4, base, w * 0.9, 9);
    rr(x, cx - w / 2, base - 26, w, 26, 6); fillOut(x, vol(x, cx - w / 2, base - 26, cx + w / 2, base, '#8d5a33'));
    ell(x, cx, base - 26, w / 2, 8); fillOut(x, '#e2b27a');
    for (const k of [0.65, 0.35]) { ell(x, cx, base - 26, (w / 2) * k, 8 * k); x.strokeStyle = '#b0804c'; x.lineWidth = 1.4; x.stroke(); }
    x.strokeStyle = '#6fa83a'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(cx + w / 2 - 2, base - 8); x.quadraticCurveTo(cx + w / 2 + 10, base - 18, cx + w / 2 + 6, base - 26); x.stroke();
    ell(x, cx + w / 2 + 7, base - 27, 4.5, 2.4, -0.6); fillOut(x, '#8cc152', 1.4);
  });
}

// ---------------------------------------------------------------- rochas e minérios
function rockShape(x: Ctx, cx: number, cy: number, r: number, seed: number) {
  const rnd = mulberry(seed);
  x.beginPath();
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const rr2 = r * (0.85 + rnd() * 0.2);
    const px = cx + Math.cos(a) * rr2 * 1.1, py = cy + Math.sin(a) * rr2 * 0.95;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.quadraticCurveTo(cx + r * 1.15, cy + r * 0.55, cx, cy + r * 0.5);
  x.quadraticCurveTo(cx - r * 1.15, cy + r * 0.55, cx - r * 1.1, cy);
  x.closePath();
}

function rock(cx: number, cy: number, r: number, col: string, seed: number, x: Ctx, moss = true, vein?: string) {
  shadow(x, cx + 4, cy + r * 0.45, r * 1.2, r * 0.38);
  rockShape(x, cx, cy, r, seed);
  fillOut(x, vol(x, cx - r, cy - r, cx + r, cy + r * 0.5, col, 0.22, -0.3));
  // faceta iluminada
  x.beginPath(); x.moveTo(cx - r * 0.7, cy - r * 0.35); x.quadraticCurveTo(cx - r * 0.1, cy - r * 0.95, cx + r * 0.5, cy - r * 0.6); x.quadraticCurveTo(cx, cy - r * 0.25, cx - r * 0.7, cy - r * 0.35);
  x.fillStyle = 'rgba(255,255,255,.22)'; x.fill();
  x.strokeStyle = shade(col, -0.3); x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx + r * 0.1, cy - r * 0.2); x.lineTo(cx + r * 0.35, cy + r * 0.2); x.stroke();
  if (moss) { ell(x, cx - r * 0.45, cy - r * 0.55, r * 0.32, r * 0.14, -0.3); x.fillStyle = 'rgba(120,180,80,.75)'; x.fill(); }
  if (vein) {
    const rnd = mulberry(seed * 3);
    for (let i = 0; i < 4; i++) {
      const px = cx + (rnd() - 0.5) * r * 1.1, py = cy + (rnd() - 0.6) * r * 0.8, s = r * (0.16 + rnd() * 0.1);
      x.beginPath(); x.moveTo(px - s, py); x.lineTo(px, py - s * 1.2); x.lineTo(px + s, py); x.lineTo(px, py + s * 0.9); x.closePath();
      fillOut(x, vol(x, px - s, py - s, px + s, py + s, vein, 0.35, -0.2), 1.6);
      shine(x, px - s * 0.3, py - s * 0.4, s * 0.3, s * 0.2, 0.75);
    }
  }
}

function rubble(col: string): Art {
  return art(100, 70, 0.8, (x) => { rock(32, 46, 13, col, 3, x, false); rock(64, 50, 16, shade(col, -0.05), 5, x, false); rock(50, 36, 9, col, 7, x, false); });
}

// ---------------------------------------------------------------- plantas baixas
function tuft(col: string, tall: number, seed: number, tip?: string): Art {
  return art(90, 100, 0.88, (x) => {
    const rnd = mulberry(seed), base = 88, cx = 45;
    shadow(x, cx + 2, base, 26, 6, 0.22);
    for (let i = -6; i <= 6; i++) {
      const bx = cx + i * 2.6, h = tall * (0.7 + rnd() * 0.4), lean = i * 2.2 + (rnd() - 0.5) * 6;
      x.beginPath(); x.moveTo(bx - 3, base); x.quadraticCurveTo(bx + lean * 0.4, base - h * 0.6, bx + lean, base - h); x.quadraticCurveTo(bx + lean * 0.5 + 2, base - h * 0.5, bx + 3, base); x.closePath();
      fillOut(x, vol(x, bx - 6, base - h, bx + 6, base, i % 2 ? col : shade(col, -0.1), 0.3, -0.18), 1.2, shade(col, -0.5));
      if (tip && i % 3 === 0) { ell(x, bx + lean, base - h - 3, 3, 7, lean * 0.03); fillOut(x, tip, 1.4); }
    }
  });
}

function mushrooms(): Art {
  return art(90, 80, 0.86, (x) => {
    shadow(x, 48, 68, 30, 7);
    for (const [cx, s] of [[30, 0.85], [56, 1], [44, 0.62]] as const) {
      const base = 68;
      rr(x, cx - 5 * s, base - 20 * s, 10 * s, 20 * s, 4); fillOut(x, vol(x, cx - 6, base - 20, cx + 6, base, '#f6ead2'));
      x.beginPath(); x.ellipse(cx, base - 20 * s, 15 * s, 12 * s, 0, Math.PI, 0); x.quadraticCurveTo(cx, base - 14 * s, cx - 15 * s, base - 20 * s); x.closePath();
      fillOut(x, sphere(x, cx, base - 26 * s, 15 * s, '#e2574c'));
      for (const [dx, dy, r] of [[-6, -6, 2.6], [5, -9, 2], [1, -3, 1.8]]) { ell(x, cx + dx * s, base - 20 * s + dy * s, r * s, r * s * 0.8); x.fillStyle = '#fff8ec'; x.fill(); }
    }
  });
}

function herbBush(on: boolean): Art {
  return art(100, 90, 0.86, (x) => {
    shadow(x, 52, 76, 34, 8);
    const paths = [[32, 58, 20], [66, 58, 20], [50, 46, 22], [50, 64, 20]].map(([cx, cy, r], i) => () => blobPath(x, cx, cy, on ? r : r * 0.6, 8, 0.25, mulberry(40 + i)));
    cluster(x, paths, [sphere(x, 50, 50, 34, on ? '#4fae68' : '#7a9a5a')]);
    if (on) for (const [cx, cy] of [[34, 52], [58, 44], [48, 62], [68, 58]]) { for (let k = 0; k < 5; k++) { ell(x, cx + Math.cos(k * 1.26) * 2.6, cy + Math.sin(k * 1.26) * 2.6, 2, 2); x.fillStyle = '#ffffff'; x.fill(); } ell(x, cx, cy, 1.4, 1.4); x.fillStyle = '#f5b82e'; x.fill(); }
  });
}

function mound(col: string, speck: string, seed: number): Art {
  return art(110, 76, 0.82, (x) => {
    const rnd = mulberry(seed);
    shadow(x, 58, 60, 44, 9);
    x.beginPath(); x.moveTo(12, 60); x.bezierCurveTo(16, 22, 44, 18, 56, 22); x.bezierCurveTo(74, 16, 98, 26, 98, 60); x.quadraticCurveTo(55, 70, 12, 60); x.closePath();
    fillOut(x, vol(x, 10, 18, 100, 64, col, 0.2, -0.28));
    for (let i = 0; i < 12; i++) { ell(x, 24 + rnd() * 62, 30 + rnd() * 24, 2, 1.4); x.fillStyle = speck; x.fill(); }
    shine(x, 40, 30, 12, 4, 0.3);
  });
}

function hole(): Art {
  return art(100, 60, 0.75, (x) => {
    ell(x, 50, 40, 34, 13); fillOut(x, '#7a5230');
    ell(x, 50, 42, 26, 9); x.fillStyle = '#4e3420'; x.fill();
    for (const [px, py] of [[18, 34], [82, 38], [30, 50]]) { ell(x, px, py, 5, 3); fillOut(x, '#a87a4a', 1.4); }
  });
}

function wildflowers(on: boolean): Art {
  return art(110, 80, 0.85, (x) => {
    const rnd = mulberry(77);
    for (let i = 0; i < 11; i++) {
      const fx = 14 + (i * 23) % 84, fy = 34 + (i * 13) % 32;
      x.strokeStyle = '#5a9a3a'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(fx, fy + 14); x.quadraticCurveTo(fx + 2, fy + 6, fx, on ? fy : fy + 8); x.stroke();
      ell(x, fx - 4, fy + 9, 3.6, 1.8, 0.5); fillOut(x, '#7cb342', 1);
      if (!on) continue;
      const col = ['#f28cb1', '#fff176', '#ce93d8', '#ff8a65', '#ffffff'][Math.floor(rnd() * 5)];
      for (let k = 0; k < 5; k++) { ell(x, fx + Math.cos(k * 1.26) * 3.6, fy + Math.sin(k * 1.26) * 3.6, 3, 3); fillOut(x, col, 1); }
      ell(x, fx, fy, 2, 2); x.fillStyle = '#f5b82e'; x.fill();
    }
  });
}

function crystal(): Art {
  return art(110, 120, 0.88, (x) => {
    rock(55, 92, 22, '#7d7a86', 11, x, false);
    for (const [cx, h, w, col] of [[38, 52, 11, '#7fd6ff'], [56, 70, 13, '#b3ecff'], [74, 44, 10, '#8fdcff']] as const) {
      x.beginPath(); x.moveTo(cx - w, 96); x.lineTo(cx - w * 0.8, 96 - h * 0.7); x.lineTo(cx, 96 - h); x.lineTo(cx + w * 0.8, 96 - h * 0.7); x.lineTo(cx + w, 96); x.closePath();
      fillOut(x, vol(x, cx - w, 96 - h, cx + w, 96, col, 0.35, -0.25));
      x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 2, 92); x.lineTo(cx - 1, 100 - h); x.stroke();
    }
  });
}

/** Todas as artes de nós de recurso (chave = tipo; `_off` = esgotado). */
export function nodeArts(): Record<string, Art> {
  const A: Record<string, Art> = {};
  A.tree_oak = oak(3); A.tree_oak_off = stump(false);
  A.tree_big = oak(9, '#3f8a3e', undefined, true); A.tree_big_off = stump(true);
  A.apple_tree = oak(5, '#6fb04c', '#e53935'); A.apple_tree_off = oak(5, '#6fb04c');
  A.orange_tree = oak(6, '#5d9e45', '#fb8c00'); A.orange_tree_off = oak(6, '#5d9e45');
  A.peach_tree = oak(8, '#7cb85a', '#ffab91'); A.peach_tree_off = oak(8, '#7cb85a');
  A.grass = tuft('#8fcf4a', 46, 1); A.grass_off = tuft('#8fcf4a', 12, 1);
  A.reeds = tuft('#7d9a3a', 62, 2, '#8d5a33'); A.reeds_off = tuft('#7d9a3a', 14, 2);
  A.herb_bush = herbBush(true); A.herb_bush_off = herbBush(false);
  A.mushroom = mushrooms(); A.mushroom_off = art(80, 50, 0.8, (x) => shadow(x, 40, 34, 22, 6, 0.18));
  A.clay = mound('#c97b4a', '#9c5a32', 1); A.clay_off = hole();
  A.sand = mound('#ead69e', '#c9b26e', 2); A.sand_off = hole();
  A.rock_small = art(90, 76, 0.82, (x) => rock(45, 46, 22, '#a7adb2', 1, x)); A.rock_small_off = rubble('#a7adb2');
  A.rock_big = art(130, 104, 0.84, (x) => rock(65, 62, 36, '#959ba2', 2, x)); A.rock_big_off = rubble('#959ba2');
  A.coal = art(90, 76, 0.82, (x) => rock(45, 46, 22, '#7a7c82', 4, x, false, '#2b2b30')); A.coal_off = rubble('#7a7c82');
  A.copper = art(90, 76, 0.82, (x) => rock(45, 46, 22, '#9aa0a6', 5, x, false, '#e08a42')); A.copper_off = rubble('#9aa0a6');
  A.iron = art(90, 76, 0.82, (x) => rock(45, 46, 22, '#958d88', 6, x, false, '#dfe5ea')); A.iron_off = rubble('#958d88');
  A.gold = art(130, 104, 0.84, (x) => rock(65, 62, 36, '#8e877a', 7, x, false, '#f6c445')); A.gold_off = rubble('#8e877a');
  A.crystal = crystal(); A.crystal_off = rubble('#7d7a86');
  A.wildflower = wildflowers(true); A.wildflower_off = wildflowers(false);
  return A;
}

/** Decoração (não interativa). */
export function decorArts(): Record<string, Art> {
  const D: Record<string, Art> = {};
  D.pine = pine(4); D.pine2 = pine(6, '#3b7a4e');
  D.oak_d = oak(12, '#58a040'); D.oak_d2 = oak(14, '#64aa48');
  D.bush = art(90, 70, 0.86, (x) => { shadow(x, 46, 58, 34, 7); const p = [[28, 44, 18], [58, 44, 18], [44, 34, 20]].map(([cx, cy, r], i) => () => blobPath(x, cx, cy, r, 8, 0.2, mulberry(60 + i))); cluster(x, p, [sphere(x, 44, 40, 32, '#5aa246')]); shine(x, 34, 30, 7, 3, 0.25); });
  D.berrybush = art(90, 70, 0.86, (x) => { shadow(x, 46, 58, 34, 7); const p = [[28, 44, 18], [58, 44, 18], [44, 34, 20]].map(([cx, cy, r], i) => () => blobPath(x, cx, cy, r, 8, 0.2, mulberry(70 + i))); cluster(x, p, [sphere(x, 44, 40, 32, '#4f9a44')]); for (const [cx, cy] of [[30, 40], [50, 32], [58, 48], [40, 50]]) { ell(x, cx, cy, 3.4, 3.4); fillOut(x, sphere(x, cx, cy, 3.4, '#7b3fa0'), 1); } });
  D.flowers_a = wildflowers(true);
  D.flowers_b = art(70, 50, 0.85, (x) => { for (let i = 0; i < 5; i++) { const fx = 12 + i * 11, fy = 22 + (i % 2) * 8; x.strokeStyle = '#5a9a3a'; x.lineWidth = 2; x.beginPath(); x.moveTo(fx, fy + 14); x.lineTo(fx, fy); x.stroke(); const col = ['#ffffff', '#fff176', '#f7a6c4'][i % 3]; for (let k = 0; k < 6; k++) { ell(x, fx + Math.cos(k) * 3.2, fy + Math.sin(k) * 3.2, 2.6, 2.6); fillOut(x, col, 0.9); } ell(x, fx, fy, 1.6, 1.6); x.fillStyle = '#f5b82e'; x.fill(); } });
  D.pebbles = art(60, 40, 0.7, (x) => { for (const [cx, cy, r] of [[18, 24, 6], [34, 28, 8], [46, 22, 5]]) { ell(x, cx, cy, r, r * 0.7); fillOut(x, vol(x, cx - r, cy - r, cx + r, cy + r, '#b7bcc0'), 1.4); } });
  D.fern = tuft('#6fb04c', 30, 9);
  D.log = art(110, 60, 0.75, (x) => { shadow(x, 56, 44, 44, 7); rr(x, 14, 22, 80, 22, 11); fillOut(x, vol(x, 14, 22, 94, 44, '#9c6a3c')); ell(x, 92, 33, 8, 11); fillOut(x, '#e2b27a', 1.8); ell(x, 92, 33, 4, 6); x.strokeStyle = '#b0804c'; x.lineWidth = 1.2; x.stroke(); ell(x, 40, 22, 7, 3); x.fillStyle = 'rgba(120,180,80,.8)'; x.fill(); });
  D.mush_s = mushrooms();
  D.stone_s = art(70, 56, 0.8, (x) => rock(35, 34, 14, '#adb2b7', 21, x));
  D.lily = art(64, 40, 0.5, (x) => { ell(x, 32, 22, 20, 11); fillOut(x, '#6fb04c', 1.8); x.beginPath(); x.moveTo(32, 22); x.lineTo(50, 18); x.lineTo(48, 26); x.closePath(); x.fillStyle = '#5fb6dc'; x.fill(); ell(x, 26, 18, 5, 4); fillOut(x, '#f7a6c4', 1.2); });
  return D;
}
