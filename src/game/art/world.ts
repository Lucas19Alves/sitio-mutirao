// Sprites dos nós de recurso (árvores, rochas, minérios...), desenhados a 2x.
import { canvas, ellipse, fs, gloss, groundShadow, poly, rrect, shade, INK } from './draw.ts';

type Ctx = CanvasRenderingContext2D;

function canopy(x: Ctx, cx: number, cy: number, r: number, col: string) {
  for (const [dx, dy, s] of [[-0.55, 0.2, 0.62], [0.55, 0.2, 0.62], [0, -0.35, 0.7], [0, 0.25, 0.75]] as const) {
    ellipse(x, cx + dx * r, cy + dy * r, r * s, r * s * 0.92); fs(x, col, 2.4);
  }
  ellipse(x, cx - r * 0.25, cy - r * 0.45, r * 0.32, r * 0.2, -0.4); x.fillStyle = 'rgba(255,255,255,.22)'; x.fill();
}

function trunk(x: Ctx, cx: number, top: number, bottom: number, w: number, col = '#8d5a33') {
  x.beginPath(); x.moveTo(cx - w / 2, bottom); x.lineTo(cx - w / 2.6, top); x.lineTo(cx + w / 2.6, top); x.lineTo(cx + w / 2, bottom); x.closePath(); fs(x, col, 2.4);
}

function rock(x: Ctx, cx: number, cy: number, r: number, col: string) {
  poly(x, [cx - r, cy + r * 0.4, cx - r * 0.8, cy - r * 0.3, cx - r * 0.2, cy - r * 0.75, cx + r * 0.6, cy - r * 0.55, cx + r, cy + r * 0.1, cx + r * 0.7, cy + r * 0.6, cx - r * 0.5, cy + r * 0.7]);
  fs(x, col, 2.4);
  poly(x, [cx - r * 0.2, cy - r * 0.75, cx + r * 0.6, cy - r * 0.55, cx + r * 0.3, cy - r * 0.1, cx - r * 0.4, cy - r * 0.2]); x.fillStyle = 'rgba(255,255,255,.22)'; x.fill();
}

export interface SpriteArt { c: HTMLCanvasElement; ox: number; oy: number } // origem (0..1)

function sprite(w: number, h: number, draw: (x: Ctx) => void, oy = 0.92): SpriteArt {
  const { c, ctx } = canvas(w, h);
  draw(ctx);
  return { c, ox: 0.5, oy };
}

/** Texturas de nós: `${tipo}` e `${tipo}_off` (esgotado). */
export function nodeArts(): Record<string, SpriteArt> {
  const A: Record<string, SpriteArt> = {};
  const fruitTree = (fruit: string | null, leafCol: string) => sprite(104, 132, (x) => {
    groundShadow(x, 52, 120, 30, 9); trunk(x, 52, 70, 122, 18);
    canopy(x, 52, 54, 40, leafCol);
    if (fruit) for (const [a, b] of [[30, 50], [52, 34], [72, 52], [44, 70], [64, 72], [38, 30]]) { ellipse(x, a, b, 6, 6); fs(x, fruit, 1.8); ellipse(x, a - 2, b - 2, 2, 1.4); x.fillStyle = 'rgba(255,255,255,.6)'; x.fill(); }
  });
  const stump = (big: boolean) => sprite(big ? 80 : 64, 64, (x) => {
    const w = big ? 30 : 22, cx = big ? 40 : 32;
    groundShadow(x, cx, 54, w * 0.9, 7); rrect(x, cx - w / 2, 34, w, 20, 4); fs(x, '#8d5a33', 2.4);
    ellipse(x, cx, 34, w / 2, 6); fs(x, '#d9a766', 2.2); ellipse(x, cx, 34, w / 4, 3); x.strokeStyle = '#a0673a'; x.lineWidth = 1.5; x.stroke();
    x.strokeStyle = '#6d8a2a'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx + w / 2, 50); x.quadraticCurveTo(cx + w / 2 + 6, 44, cx + w / 2 + 3, 40); x.stroke();
  });
  A.tree_oak = sprite(96, 128, (x) => { groundShadow(x, 48, 116, 28, 8); trunk(x, 48, 70, 118, 16); canopy(x, 48, 54, 36, '#5fa046'); });
  A.tree_oak_off = stump(false);
  A.tree_big = sprite(136, 176, (x) => { groundShadow(x, 68, 162, 40, 11); trunk(x, 68, 90, 166, 28, '#6b3f22'); canopy(x, 68, 70, 56, '#3f7f3a'); ellipse(x, 52, 120, 10, 4); x.fillStyle = 'rgba(0,0,0,.15)'; x.fill(); });
  A.tree_big_off = stump(true);
  A.apple_tree = fruitTree('#e53935', '#6fb04c'); A.apple_tree_off = fruitTree(null, '#6fb04c');
  A.orange_tree = fruitTree('#fb8c00', '#5d9e45'); A.orange_tree_off = fruitTree(null, '#5d9e45');
  A.peach_tree = fruitTree('#ffab91', '#7cb85a'); A.peach_tree_off = fruitTree(null, '#7cb85a');
  const tuft = (col: string, tall: number, flowers?: string) => sprite(64, 72, (x) => {
    groundShadow(x, 32, 62, 18, 5, 0.18);
    for (let i = -4; i <= 4; i++) { x.beginPath(); x.moveTo(32 + i * 2.2, 64); x.quadraticCurveTo(32 + i * 4, 64 - tall * 0.6, 32 + i * 6, 64 - tall + Math.abs(i) * 3); x.lineWidth = 5; x.strokeStyle = INK; x.stroke(); x.lineWidth = 3; x.strokeStyle = i % 2 ? col : shade(col, -0.18); x.stroke(); }
    if (flowers) for (let i = 0; i < 4; i++) { ellipse(x, 18 + i * 9, 64 - tall + 6 + (i % 2) * 6, 3, 3); fs(x, flowers, 1.4); }
  }, 0.9);
  A.grass = tuft('#9ccc44', 40); A.grass_off = tuft('#9ccc44', 12);
  A.reeds = tuft('#7d9a3a', 54, '#8d6e44'); A.reeds_off = tuft('#7d9a3a', 14);
  A.herb_bush = sprite(64, 64, (x) => { groundShadow(x, 32, 56, 20, 6); for (const [a, b] of [[22, 42], [42, 42], [32, 32]]) { ellipse(x, a, b, 14, 12); fs(x, '#4caf6a', 2.2); } for (const [a, b] of [[24, 36], [40, 34], [32, 44]]) { ellipse(x, a, b, 3, 3); x.fillStyle = '#e1f5c4'; x.fill(); } });
  A.herb_bush_off = sprite(64, 64, (x) => { groundShadow(x, 32, 56, 14, 5); for (const [a, b] of [[26, 48], [38, 48]]) { ellipse(x, a, b, 8, 6); fs(x, '#6a9a5a', 2); } });
  A.mushroom = sprite(64, 60, (x) => { groundShadow(x, 32, 52, 20, 5); for (const [a, s] of [[22, 0.8], [40, 1], [32, 0.6]] as const) { rrect(x, a - 4 * s, 52 - 18 * s, 8 * s, 18 * s, 3); fs(x, '#f5e6c8', 2); x.beginPath(); x.ellipse(a, 52 - 18 * s, 13 * s, 10 * s, 0, Math.PI, 0); x.closePath(); fs(x, '#d9534f', 2); ellipse(x, a - 4 * s, 52 - 24 * s, 2.5 * s, 2 * s); x.fillStyle = '#fff'; x.fill(); } });
  A.mushroom_off = sprite(64, 60, (x) => { ellipse(x, 32, 50, 14, 5); x.fillStyle = 'rgba(90,60,30,.35)'; x.fill(); });
  const mound = (col: string, dots: string) => sprite(72, 52, (x) => { groundShadow(x, 36, 44, 30, 7); x.beginPath(); x.moveTo(6, 44); x.quadraticCurveTo(18, 10, 36, 14); x.quadraticCurveTo(58, 10, 66, 44); x.closePath(); fs(x, col, 2.4); for (let i = 0; i < 10; i++) { ellipse(x, 18 + (i * 13) % 38, 26 + (i * 7) % 14, 2, 1.4); x.fillStyle = dots; x.fill(); } gloss(x, 26, 22, 8, 4, 0.2); });
  const hole = () => sprite(72, 52, (x) => { ellipse(x, 36, 38, 24, 9); fs(x, '#6d4c2f', 2); ellipse(x, 36, 40, 18, 6); x.fillStyle = '#4e3420'; x.fill(); });
  A.clay = mound('#c97b4a', '#9c5a32'); A.clay_off = hole();
  A.sand = mound('#e8d39a', '#c9b26e'); A.sand_off = hole();
  const rocky = (col: string, big: boolean, vein?: string) => sprite(big ? 96 : 72, big ? 84 : 60, (x) => {
    const cx = big ? 48 : 36, cy = big ? 52 : 38, r = big ? 36 : 24;
    groundShadow(x, cx, cy + r * 0.62, r, r * 0.25); rock(x, cx, cy, r, col);
    if (vein) for (const [a, b, s] of [[-0.35, -0.1, 0.22], [0.3, 0.15, 0.18], [0, 0.35, 0.15]]) { poly(x, [cx + a * r - s * r, cy + b * r, cx + a * r, cy + b * r - s * r, cx + a * r + s * r, cy + b * r, cx + a * r, cy + b * r + s * r]); fs(x, vein, 1.6); }
  }, 0.9);
  const rubble = (col: string) => sprite(72, 48, (x) => { for (const [a, b, r] of [[24, 34, 8], [42, 36, 10], [34, 28, 6]]) rock(x, a, b, r, shade(col, 0.05)); });
  A.rock_small = rocky('#9aa0a6', false); A.rock_small_off = rubble('#9aa0a6');
  A.rock_big = rocky('#8d939a', true); A.rock_big_off = rubble('#8d939a');
  A.coal = rocky('#6d6f75', false, '#2b2b30'); A.coal_off = rubble('#6d6f75');
  A.copper = rocky('#8a8f94', false, '#d9823b'); A.copper_off = rubble('#8a8f94');
  A.iron = rocky('#8c8580', false, '#c7ccd1'); A.iron_off = rubble('#8c8580');
  A.gold = rocky('#857f72', true, '#f2c230'); A.gold_off = rubble('#857f72');
  A.crystal = sprite(80, 92, (x) => { groundShadow(x, 40, 80, 26, 7); rock(x, 40, 66, 22, '#7d7a86'); for (const [a, h, col] of [[28, 34, '#7fd6ff'], [42, 46, '#b3ecff'], [54, 30, '#7fd6ff']] as const) { poly(x, [a - 7, 70, a, 70 - h, a + 7, 70]); fs(x, col, 2.2); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(a - 1, 66); x.lineTo(a, 74 - h); x.stroke(); } }, 0.88);
  A.crystal_off = rubble('#7d7a86');
  A.wildflower = sprite(72, 56, (x) => { for (let i = 0; i < 9; i++) { const a = 12 + (i * 17) % 48, b = 22 + (i * 11) % 24; x.strokeStyle = '#558b2f'; x.lineWidth = 2; x.beginPath(); x.moveTo(a, b + 10); x.lineTo(a, b); x.stroke(); const col = ['#f28cb1', '#fff176', '#ce93d8', '#ff8a65'][i % 4]; for (let k = 0; k < 5; k++) { ellipse(x, a + Math.cos(k * 1.26) * 3.4, b + Math.sin(k * 1.26) * 3.4, 2.6, 2.6); fs(x, col, 1); } ellipse(x, a, b, 1.8, 1.8); x.fillStyle = '#f9a825'; x.fill(); } }, 0.85);
  A.wildflower_off = sprite(72, 56, (x) => { for (let i = 0; i < 9; i++) { const a = 12 + (i * 17) % 48, b = 30 + (i * 11) % 18; x.strokeStyle = '#7a9a4a'; x.lineWidth = 2; x.beginPath(); x.moveTo(a, b + 6); x.lineTo(a + 1, b); x.stroke(); } }, 0.85);
  return A;
}

