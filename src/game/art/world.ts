// Arte procedural do mundo: terreno, nós de recurso, prédios e cultivos.
// Sprites são desenhados a 2x e exibidos com escala 0.5 (nitidez com zoom).
import { REGIONS, PATHS, RIVER, BRIDGES, MAP_W, MAP_H, TILE, FIELD, PATH_TILES, buildingTiles, regionAt, CROPS, RECIPES, type BuildingDef } from '../../data/catalog.ts';
import { canvas, ellipse, fs, gloss, groundShadow, mulberry, poly, rrect, shade, INK } from './draw.ts';
import { drawIcon } from './icons.ts';
import { ITEM_BY_ID } from '../../data/items.ts';

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- terreno
export function drawGround(): HTMLCanvasElement {
  const W = MAP_W * TILE, H = MAP_H * TILE;
  const { c, ctx } = canvas(W, H);
  const rand = mulberry(7);
  const occupied = buildingTiles();

  // floresta densa na borda
  ctx.fillStyle = '#3f6e35'; ctx.fillRect(0, 0, W, H);
  for (const r of REGIONS) {
    const { x, y, w, h } = r.rect;
    ctx.fillStyle = r.ground; ctx.fillRect(x * TILE, y * TILE, w * TILE, h * TILE);
  }
  // variação por tile
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const reg = regionAt(tx, ty);
    if (!reg) continue;
    const base = REGIONS.find((r) => r.id === reg)!.ground;
    ctx.fillStyle = shade(base, (rand() - 0.5) * 0.045);
    ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
  }
  // transição suave entre regiões
  for (const r of REGIONS) {
    const { x, y, w, h } = r.rect;
    ctx.strokeStyle = 'rgba(40,60,20,.12)'; ctx.lineWidth = 6; ctx.strokeRect(x * TILE, y * TILE, w * TILE, h * TILE);
  }
  // detalhes de cada região
  for (let i = 0; i < 2600; i++) {
    const px = rand() * W, py = rand() * H;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    const reg = regionAt(tx, ty);
    if (!reg || PATH_TILES.has(`${tx},${ty}`) || occupied.has(`${tx},${ty}`)) continue;
    if (ty >= RIVER.y0 - 1 && ty <= RIVER.y1 + 1) continue;
    const kind = rand();
    if (reg === 'colinas' && kind < 0.25) { ellipse(ctx, px, py, 3 + rand() * 4, 2 + rand() * 3); ctx.fillStyle = 'rgba(120,110,90,.35)'; ctx.fill(); continue; }
    if (reg === 'planalto' && kind < 0.3) { ctx.strokeStyle = 'rgba(90,70,40,.25)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 6, py + 3); ctx.lineTo(px + 9, py - 2); ctx.stroke(); continue; }
    if (reg === 'vale' && kind < 0.45 || kind < 0.07) {
      const col = ['#f28cb1', '#fff176', '#ffffff', '#ce93d8', '#ffab91'][Math.floor(rand() * 5)];
      for (let k = 0; k < 4; k++) { ellipse(ctx, px + Math.cos(k * 1.57) * 2.2, py + Math.sin(k * 1.57) * 2.2, 2, 2); ctx.fillStyle = col; ctx.fill(); }
      ellipse(ctx, px, py, 1.3, 1.3); ctx.fillStyle = '#f9a825'; ctx.fill();
      continue;
    }
    if (reg === 'bosque' && kind < 0.3) { ellipse(ctx, px, py, 3, 1.6, rand() * 3); ctx.fillStyle = 'rgba(120,80,30,.3)'; ctx.fill(); continue; }
    // tufos de grama
    ctx.strokeStyle = 'rgba(40,90,30,.35)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(px - 3, py + 3); ctx.lineTo(px - 1, py - 3); ctx.moveTo(px, py + 3); ctx.lineTo(px + 1, py - 4); ctx.moveTo(px + 3, py + 3); ctx.lineTo(px + 4, py - 2); ctx.stroke();
  }

  // caminhos
  const strokePath = (w: number, col: string) => {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    for (const line of PATHS) {
      ctx.beginPath();
      line.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x * TILE + TILE / 2, y * TILE + TILE / 2));
      ctx.stroke();
    }
  };
  strokePath(30, '#b48a52'); strokePath(24, '#d6b47a');
  for (const k of PATH_TILES) {
    const [tx, ty] = k.split(',').map(Number);
    for (let i = 0; i < 3; i++) { ellipse(ctx, tx * TILE + rand() * TILE, ty * TILE + 8 + rand() * 16, 1.5 + rand(), 1 + rand()); ctx.fillStyle = 'rgba(140,100,60,.45)'; ctx.fill(); }
  }

  // rio
  const ry0 = RIVER.y0 * TILE, ry1 = (RIVER.y1 + 1) * TILE;
  ctx.fillStyle = '#d9c38a'; ctx.fillRect(0, ry0 - 10, W, ry1 - ry0 + 20);
  ctx.beginPath(); ctx.moveTo(0, ry0 - 2);
  for (let x = 0; x <= W; x += 32) ctx.lineTo(x, ry0 - 2 + Math.sin(x / 70) * 4);
  for (let x = W; x >= 0; x -= 32) ctx.lineTo(x, ry1 + 2 + Math.sin(x / 55 + 1) * 4);
  ctx.closePath(); ctx.fillStyle = '#3f93be'; ctx.fill();
  ctx.fillStyle = '#56a9cf'; ctx.fillRect(0, ry0 + 14, W, ry1 - ry0 - 28);
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2;
  for (let i = 0; i < 140; i++) { const x = rand() * W, y = ry0 + 8 + rand() * (ry1 - ry0 - 16); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6, y - 3, x + 12, y); ctx.stroke(); }
  for (const b of BRIDGES) {
    const bx = b.x0 * TILE, bw = (b.x1 - b.x0 + 1) * TILE;
    rrect(ctx, bx - 4, ry0 - 14, bw + 8, ry1 - ry0 + 28, 4); fs(ctx, '#8d5a33', 3);
    for (let y = ry0 - 12; y < ry1 + 12; y += 9) { rrect(ctx, bx - 2, y, bw + 4, 7, 2); fs(ctx, y % 18 ? '#c99a5b' : '#b8874a', 1.5); }
    ctx.fillStyle = '#6b3f22'; ctx.fillRect(bx - 6, ry0 - 16, 5, ry1 - ry0 + 32); ctx.fillRect(bx + bw + 1, ry0 - 16, 5, ry1 - ry0 + 32);
  }

  // cerca do campo
  const fx = FIELD.x * TILE - 6, fy = FIELD.y * TILE - 6, fw = FIELD.cols * FIELD.size * TILE + 12, fh = FIELD.rows * FIELD.size * TILE + 12;
  rrect(ctx, fx, fy, fw, fh, 8); ctx.fillStyle = '#9c7a4a'; ctx.fill();
  ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 3; ctx.strokeRect(fx - 3, fy - 3, fw + 6, fh + 6);
  for (let x = fx - 3; x <= fx + fw + 3; x += 16) for (const y of [fy - 3, fy + fh + 3]) { rrect(ctx, x - 2.5, y - 7, 5, 10, 1.5); fs(ctx, '#c99a5b', 1.5); }

  // árvores da borda (copas)
  for (let i = 0; i < 520; i++) {
    const px = rand() * W, py = rand() * H;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (regionAt(tx, ty) || (ty >= RIVER.y0 && ty <= RIVER.y1)) continue;
    const r = 14 + rand() * 12;
    ellipse(ctx, px, py, r, r * 0.9); fs(ctx, shade('#3d7a35', (rand() - 0.5) * 0.25), 2, 'rgba(30,50,20,.6)');
    ellipse(ctx, px - r * 0.3, py - r * 0.3, r * 0.4, r * 0.3); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
  }
  return c;
}

// ---------------------------------------------------------------- nós
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

// ---------------------------------------------------------------- prédios
const CHIMNEY = new Set(['bakery', 'foundry', 'smithy', 'kitchen', 'pottery', 'glassworks', 'farmhouse', 'jewelry']);

function signboard(x: Ctx, cx: number, cy: number, item: string | null, s = 1) {
  rrect(x, cx - 20 * s, cy - 16 * s, 40 * s, 32 * s, 6 * s); fs(x, '#f7f8f4', 3 * s, '#1d3b72');
  if (item && ITEM_BY_ID[item]) drawIcon(x, ITEM_BY_ID[item].icon, 28 * s, cx - 14 * s, cy - 14 * s);
}

function house(x: Ctx, W: number, H: number, b: BuildingDef, roofStyle: 'gable' | 'barn' | 'flat' | 'dome') {
  const wallTop = H * 0.48, base = H - 10;
  const roof = b.roof, wall = b.wall;
  groundShadow(x, W / 2, base + 2, W * 0.5, 12, 0.25);
  // paredes
  rrect(x, 10, wallTop, W - 20, base - wallTop, 6); fs(x, wall, 3);
  x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(12, base - 18, W - 24, 14);
  // tábuas/tijolos
  x.strokeStyle = shade(wall, -0.12); x.lineWidth = 1.5;
  for (let yy = wallTop + 14; yy < base - 6; yy += 14) { x.beginPath(); x.moveTo(14, yy); x.lineTo(W - 14, yy); x.stroke(); }
  // telhado
  if (roofStyle === 'gable') {
    poly(x, [0, wallTop + 6, W / 2, 10, W, wallTop + 6]); fs(x, roof, 3);
    x.strokeStyle = shade(roof, -0.2); x.lineWidth = 2;
    for (let i = 1; i < 6; i++) { const t = i / 6; x.beginPath(); x.moveTo(W / 2 - (W / 2) * t, 10 + (wallTop - 4) * t); x.lineTo(W / 2 + (W / 2) * t, 10 + (wallTop - 4) * t); x.stroke(); }
    poly(x, [W / 2 - 4, 12, W / 2 + 4, 12, W / 2 + 2, 26, W / 2 - 2, 26]); x.fillStyle = 'rgba(255,255,255,.18)'; x.fill();
  } else if (roofStyle === 'barn') {
    poly(x, [2, wallTop + 6, 18, wallTop * 0.45, W / 2, 8, W - 18, wallTop * 0.45, W - 2, wallTop + 6]); fs(x, roof, 3);
    x.strokeStyle = '#f7f8f4'; x.lineWidth = 4; x.beginPath(); x.moveTo(18, wallTop * 0.45 + 6); x.lineTo(W / 2, 16); x.lineTo(W - 18, wallTop * 0.45 + 6); x.stroke();
  } else if (roofStyle === 'flat') {
    rrect(x, 2, wallTop - 22, W - 4, 30, 6); fs(x, roof, 3);
    x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(8, wallTop - 18, W - 16, 6);
  } else {
    x.beginPath(); x.ellipse(W / 2, wallTop + 8, W / 2 - 6, wallTop - 10, 0, Math.PI, 0); x.closePath(); fs(x, roof, 3);
    gloss(x, W * 0.35, wallTop * 0.5, W * 0.12, wallTop * 0.12, 0.25);
  }
  // chaminé
  if (CHIMNEY.has(b.id)) { rrect(x, W * 0.72, 14, 18, wallTop * 0.5, 3); fs(x, '#8a3a25', 2.5); rrect(x, W * 0.72 - 3, 10, 24, 8, 2); fs(x, '#6d2a1a', 2.5); }
  // porta
  const dw = Math.min(40, W * 0.22), dh = Math.min(60, (base - wallTop) * 0.62);
  x.beginPath(); x.moveTo(W / 2 - dw / 2, base); x.lineTo(W / 2 - dw / 2, base - dh + dw / 2); x.arc(W / 2, base - dh + dw / 2, dw / 2, Math.PI, 0); x.lineTo(W / 2 + dw / 2, base); x.closePath(); fs(x, shade(roof, -0.35), 2.5);
  ellipse(x, W / 2 + dw / 4, base - dh / 2.4, 2.5, 2.5); x.fillStyle = '#f2c230'; x.fill();
  // janelas
  const wy = wallTop + (base - wallTop) * 0.28;
  for (const wx of [W * 0.2, W * 0.8]) {
    if (W < 140 && wx > W / 2) continue;
    rrect(x, wx - 14, wy, 28, 24, 4); fs(x, '#bfe3f2', 2.5);
    x.strokeStyle = shade(roof, -0.3); x.lineWidth = 2; x.beginPath(); x.moveTo(wx, wy); x.lineTo(wx, wy + 24); x.moveTo(wx - 14, wy + 12); x.lineTo(wx + 14, wy + 12); x.stroke();
    rrect(x, wx - 17, wy + 24, 34, 6, 2); fs(x, '#8d5a33', 2);
    for (let k = 0; k < 3; k++) { ellipse(x, wx - 9 + k * 9, wy + 22, 3.5, 3.5); fs(x, ['#e91e63', '#ffd54f', '#ff7043'][k], 1.2); }
  }
}

/** Arte de cada prédio (e partes animadas). */
export function buildingArt(b: BuildingDef): { main: HTMLCanvasElement; blades?: HTMLCanvasElement } {
  const W = b.spot.w * TILE * 2, H = (b.spot.h * TILE + 44) * 2;
  const { c, ctx: x } = canvas(W, H);
  const product = RECIPES.find((r) => r.b === b.id)?.id ?? null;
  const base = H - 10;
  let blades: HTMLCanvasElement | undefined;

  switch (b.id) {
    case 'well': {
      groundShadow(x, W / 2, base, W * 0.42, 10);
      ellipse(x, W / 2, base - 24, W * 0.36, 16); fs(x, '#8d939a', 3);
      rrect(x, W * 0.14, base - 52, W * 0.72, 30, 6); fs(x, '#9aa0a6', 3);
      for (let i = 0; i < 4; i++) { x.strokeStyle = '#6d7378'; x.lineWidth = 1.5; x.strokeRect(W * 0.14 + i * W * 0.18, base - 52, W * 0.18, 15); }
      ellipse(x, W / 2, base - 52, W * 0.3, 9); fs(x, '#2f5f7a', 2.5);
      for (const px of [W * 0.2, W * 0.8]) { rrect(x, px - 4, base - 120, 8, 72, 2); fs(x, '#8d5a33', 2.5); }
      poly(x, [W * 0.08, base - 112, W / 2, base - 150, W * 0.92, base - 112]); fs(x, b.roof, 3);
      x.strokeStyle = INK; x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2, base - 112); x.lineTo(W / 2, base - 70); x.stroke();
      rrect(x, W / 2 - 9, base - 74, 18, 16, 3); fs(x, '#a0673a', 2);
      break;
    }
    case 'workbench': {
      groundShadow(x, W / 2, base, W * 0.48, 10);
      rrect(x, 12, base - 64, W - 24, 18, 4); fs(x, '#c99a5b', 3);
      for (const px of [22, W - 30]) { rrect(x, px, base - 48, 10, 44, 2); fs(x, '#8d6e44', 2.5); }
      x.save(); x.translate(W * 0.3, base - 72); x.rotate(-0.3); rrect(x, -3, -26, 6, 30, 2); fs(x, '#8d5a33', 2); rrect(x, -10, -30, 20, 9, 2); fs(x, '#9ea7ad', 2); x.restore();
      drawIcon(x, ITEM_BY_ID.rope.icon, 40, W * 0.55, base - 104);
      rrect(x, W - 60, base - 40, 34, 34, 4); fs(x, '#a0673a', 2.5);
      break;
    }
    case 'sales_cart': {
      groundShadow(x, W / 2, base, W * 0.46, 10);
      rrect(x, 14, base - 70, W - 28, 40, 6); fs(x, '#d9a766', 3);
      for (const px of [40, W - 40]) { ellipse(x, px, base - 24, 20, 20); fs(x, '#8d5a33', 3); ellipse(x, px, base - 24, 5, 5); x.fillStyle = INK; x.fill(); }
      for (const px of [20, W - 24]) { rrect(x, px, base - 140, 6, 74, 2); fs(x, '#8d6e44', 2); }
      x.beginPath(); x.moveTo(8, base - 130); x.lineTo(W - 8, base - 130); x.lineTo(W - 16, base - 104); x.lineTo(16, base - 104); x.closePath(); fs(x, '#f7f8f4', 3);
      x.save(); x.clip(); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#2f6db5' : '#f7f8f4'; x.fillRect(8 + i * (W - 16) / 8, base - 130, (W - 16) / 8, 26); } x.restore();
      for (const [px, it] of [[W * 0.3, 'carrot'], [W * 0.5, 'apple'], [W * 0.7, 'wheat']] as const) drawIcon(x, ITEM_BY_ID[it].icon, 32, px - 16, base - 98);
      drawIcon(x, { s: 'coin', c: '#f2b632' }, 34, W - 54, base - 66);
      break;
    }
    case 'order_board': {
      groundShadow(x, W / 2, base, W * 0.42, 9);
      for (const px of [14, W - 22]) { rrect(x, px, base - 120, 8, 116, 2); fs(x, '#8d5a33', 2.5); }
      rrect(x, 6, base - 132, W - 12, 80, 6); fs(x, '#a0673a', 3);
      rrect(x, 12, base - 126, W - 24, 68, 4); fs(x, '#c99a5b', 2);
      for (const [px, py, r] of [[18, base - 120, -0.1], [W / 2 - 4, base - 116, 0.08], [24, base - 90, 0.05]] as const) { x.save(); x.translate(px, py); x.rotate(r); rrect(x, 0, 0, 24, 28, 2); fs(x, '#f7f8f4', 1.6); x.fillStyle = '#9aa0a6'; for (let k = 0; k < 3; k++) x.fillRect(4, 7 + k * 6, 16, 2); x.restore(); ellipse(x, px + 12, py + 2, 2.5, 2.5); x.fillStyle = '#d8434b'; x.fill(); }
      break;
    }
    case 'market': {
      groundShadow(x, W / 2, base, W * 0.48, 10);
      rrect(x, 10, base - 56, W - 20, 50, 4); fs(x, '#d9a766', 3);
      for (const [px, it] of [[W * 0.22, 'bread'], [W * 0.5, 'jam'], [W * 0.78, 'basket']] as const) drawIcon(x, ITEM_BY_ID[it].icon, 36, px - 18, base - 92);
      for (const px of [14, W - 20]) { rrect(x, px, base - 150, 6, 100, 2); fs(x, '#8d6e44', 2); }
      x.beginPath(); x.moveTo(2, base - 150); x.lineTo(W - 2, base - 150); x.lineTo(W - 2, base - 118); x.quadraticCurveTo(W - 16, base - 106, W - 30, base - 118); x.lineTo(30, base - 118); x.quadraticCurveTo(16, base - 106, 2, base - 118); x.closePath(); fs(x, '#f7f8f4', 3);
      x.save(); x.clip(); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? b.roof : '#f7f8f4'; x.fillRect(2 + i * (W - 4) / 8, base - 150, (W - 4) / 8, 44); } x.restore();
      break;
    }
    case 'mill': {
      house(x, W, H, b, 'gable');
      const { c: bl, ctx: bx } = canvas(200, 200);
      bx.translate(100, 100);
      for (let i = 0; i < 4; i++) { bx.save(); bx.rotate((i * Math.PI) / 2); rrect(bx, -5, -96, 10, 92, 3); fs(bx, '#8d5a33', 2.5); rrect(bx, 4, -92, 26, 72, 3); fs(bx, '#f7f8f4', 2.5); bx.strokeStyle = '#c9b28a'; bx.lineWidth = 1.5; for (let k = 1; k < 4; k++) { bx.beginPath(); bx.moveTo(4, -92 + k * 18); bx.lineTo(30, -92 + k * 18); bx.stroke(); } bx.restore(); }
      ellipse(bx, 0, 0, 12, 12); fs(bx, '#6b3f22', 2.5);
      blades = bl;
      break;
    }
    case 'greenhouse': {
      groundShadow(x, W / 2, base, W * 0.5, 12);
      rrect(x, 8, base - 70, W - 16, 64, 6); fs(x, 'rgba(200,240,250,.85)', 3);
      x.beginPath(); x.ellipse(W / 2, base - 70, W / 2 - 8, 70, 0, Math.PI, 0); x.closePath(); fs(x, 'rgba(180,230,245,.9)', 3);
      x.strokeStyle = '#5d7a8c'; x.lineWidth = 2.5;
      for (let i = 1; i < 6; i++) { const px = 8 + (i * (W - 16)) / 6; x.beginPath(); x.moveTo(px, base - 6); x.lineTo(px, base - 70 - Math.sqrt(Math.max(0, 1 - ((px - W / 2) / (W / 2 - 8)) ** 2)) * 66); x.stroke(); }
      for (let i = 0; i < 6; i++) { ellipse(x, 24 + i * (W - 48) / 5, base - 22, 10, 9); fs(x, '#5fa046', 1.8); ellipse(x, 24 + i * (W - 48) / 5, base - 26, 3, 3); x.fillStyle = '#e53950'; x.fill(); }
      gloss(x, W * 0.32, base - 110, 26, 10, 0.35);
      break;
    }
    case 'apiary': {
      groundShadow(x, W / 2, base, W * 0.46, 10);
      for (const [px, py] of [[W * 0.3, base - 8], [W * 0.7, base - 8], [W * 0.5, base - 70]] as const) {
        for (let k = 0; k < 3; k++) { rrect(x, px - 28, py - 22 - k * 20, 56, 22, 4); fs(x, k % 2 ? '#ffca28' : '#ffb300', 2.5); }
        rrect(x, px - 32, py - 82, 64, 12, 3); fs(x, '#8d5a33', 2.5);
        rrect(x, px - 8, py - 14, 16, 5, 2); x.fillStyle = INK; x.fill();
      }
      break;
    }
    case 'barn': house(x, W, H, b, 'barn');
      x.strokeStyle = '#f7f8f4'; x.lineWidth = 5; x.strokeRect(W / 2 - 36, base - 70, 72, 66); x.beginPath(); x.moveTo(W / 2 - 36, base - 70); x.lineTo(W / 2 + 36, base - 4); x.moveTo(W / 2 + 36, base - 70); x.lineTo(W / 2 - 36, base - 4); x.stroke();
      break;
    case 'great_workshop': case 'warehouse': house(x, W, H, b, 'barn'); signboard(x, W / 2, H * 0.36, product ?? 'crate', 1.3); break;
    case 'pottery': case 'foundry': house(x, W, H, b, 'dome'); signboard(x, W * 0.25, H * 0.58, product); break;
    case 'glassworks': case 'oil_press': case 'smithy': house(x, W, H, b, 'flat'); signboard(x, W / 2, H * 0.36, product); break;
    default: house(x, W, H, b, 'gable'); if (product) signboard(x, W / 2, H * 0.34, product);
  }
  if (b.id === 'farmhouse') { rrect(x, 18, base - 30, W - 36, 10, 3); fs(x, '#a0673a', 2.5); for (let k = 0; k < 6; k++) { rrect(x, 24 + k * (W - 56) / 5, base - 22, 5, 18, 1); fs(x, '#c99a5b', 1.5); } }
  if (b.id === 'sawmill') { for (let k = 0; k < 3; k++) { rrect(x, W - 70, base - 22 - k * 14, 56, 14, 7); fs(x, '#a0673a', 2); ellipse(x, W - 14, base - 15 - k * 14, 6, 7); fs(x, '#d9a766', 2); } }
  return { main: c, blades };
}

/** Canteiro em construção (andaimes + materiais), por tamanho de lote. */
export function constructionArt(w: number, h: number): HTMLCanvasElement {
  const W = w * TILE * 2, H = (h * TILE + 44) * 2;
  const { c, ctx: x } = canvas(W, H);
  const base = H - 10;
  groundShadow(x, W / 2, base, W * 0.5, 12, 0.2);
  rrect(x, 8, base - (h * TILE * 2) * 0.55, W - 16, (h * TILE * 2) * 0.55, 6); fs(x, 'rgba(201,154,91,.35)', 3, 'rgba(58,42,31,.5)');
  x.strokeStyle = '#8d5a33'; x.lineWidth = 6;
  const top = base - H * 0.6;
  for (let px = 18; px < W - 10; px += (W - 36) / 3) { x.beginPath(); x.moveTo(px, base); x.lineTo(px, top); x.stroke(); }
  for (let py = base - 30; py > top; py -= 44) { x.beginPath(); x.moveTo(12, py); x.lineTo(W - 12, py); x.stroke(); }
  x.lineWidth = 4; x.strokeStyle = '#a0673a'; x.beginPath(); x.moveTo(18, base - 30); x.lineTo(W - 18, top + 10); x.stroke();
  for (let k = 0; k < 3; k++) { rrect(x, 20 + k * 22, base - 16 - k * 6, 44, 10, 3); fs(x, '#d9a766', 2); }
  rrect(x, W - 60, base - 40, 40, 36, 4); fs(x, '#c99a5b', 2.5);
  x.strokeStyle = '#f2b632'; x.lineWidth = 6; x.setLineDash([14, 10]); x.beginPath(); x.moveTo(6, base - 4); x.lineTo(W - 6, base - 4); x.stroke(); x.setLineDash([]);
  return c;
}

/** Lote vazio disponível: contorno tracejado e placa. */
export function lotArt(w: number, h: number): HTMLCanvasElement {
  const W = w * TILE * 2, H = (h * TILE + 44) * 2;
  const { c, ctx: x } = canvas(W, H);
  const base = H - 10, top = base - h * TILE * 2;
  rrect(x, 8, top + 8, W - 16, base - top - 16, 16); x.fillStyle = 'rgba(255,255,255,.14)'; x.fill();
  x.setLineDash([16, 12]); x.lineWidth = 5; x.strokeStyle = 'rgba(29,59,114,.55)'; x.stroke(); x.setLineDash([]);
  rrect(x, W / 2 - 4, base - 92, 8, 70, 2); fs(x, '#8d5a33', 2.5);
  rrect(x, W / 2 - 34, base - 120, 68, 40, 8); fs(x, '#f7f8f4', 3.5, '#1d3b72');
  x.strokeStyle = '#1d3b72'; x.lineWidth = 6; x.beginPath(); x.moveTo(W / 2 - 10, base - 100); x.lineTo(W / 2 + 10, base - 100); x.moveTo(W / 2, base - 110); x.lineTo(W / 2, base - 90); x.stroke();
  return c;
}

// ---------------------------------------------------------------- canteiros e cultivos
export function soilArt(locked: boolean): HTMLCanvasElement {
  const S = FIELD.size * TILE * 2;
  const { c, ctx: x } = canvas(S, S);
  rrect(x, 4, 4, S - 8, S - 8, 12); fs(x, locked ? '#8c7656' : '#7a5230', 3, '#5a3b20');
  for (let i = 0; i < 4; i++) { rrect(x, 12, 14 + i * 26, S - 24, 14, 7); x.fillStyle = locked ? '#9a8566' : '#8f6238'; x.fill(); }
  if (locked) { x.fillStyle = 'rgba(40,40,40,.25)'; x.fillRect(4, 4, S - 8, S - 8); }
  return c;
}

/** Planta em 3 estágios (0 broto, 1 crescendo, 2 pronta). */
export function cropArt(crop: string, stage: number): HTMLCanvasElement {
  const S = FIELD.size * TILE * 2;
  const { c, ctx: x } = canvas(S, S + 24);
  const def = CROPS.find((k) => k.id === crop)!;
  const col = def.color;
  const spots = [[S * 0.28, S * 0.36], [S * 0.72, S * 0.36], [S * 0.28, S * 0.78], [S * 0.72, S * 0.78], [S * 0.5, S * 0.57]];
  const kind = ['wheat', 'corn'].includes(crop) ? 'tall' : ['carrot', 'potato'].includes(crop) ? 'root' : ['rose', 'tulip', 'lavender', 'sunflower'].includes(crop) ? 'flower' : crop === 'pumpkin' ? 'vine' : 'bush';
  for (const [px, py0] of spots) {
    const py = py0 + 24;
    if (stage === 0) {
      x.strokeStyle = INK; x.lineWidth = 4; x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 10); x.stroke(); x.strokeStyle = '#7cb342'; x.lineWidth = 2.5; x.stroke();
      ellipse(x, px - 5, py - 11, 5, 3, -0.5); fs(x, '#8bc34a', 1.8); ellipse(x, px + 5, py - 11, 5, 3, 0.5); fs(x, '#8bc34a', 1.8);
      continue;
    }
    const h = stage === 1 ? 0.55 : 1;
    if (kind === 'tall') {
      for (const dx of [-5, 0, 5]) {
        x.beginPath(); x.moveTo(px + dx * 0.5, py); x.lineTo(px + dx, py - 40 * h); x.lineWidth = 4; x.strokeStyle = INK; x.stroke(); x.lineWidth = 2.5; x.strokeStyle = stage === 2 && crop === 'wheat' ? '#c9a43a' : '#6fa83a'; x.stroke();
        if (stage === 2) { if (crop === 'wheat') { ellipse(x, px + dx, py - 44, 3.5, 9); fs(x, col, 1.6); } else { ellipse(x, px + dx + 3, py - 30, 4, 9, 0.3); fs(x, col, 1.6); } }
      }
    } else if (kind === 'root') {
      for (const r of [-0.5, 0, 0.5]) { ellipse(x, px + r * 10, py - 14 * h, 4, 12 * h, r); fs(x, '#5fa046', 1.8); }
      if (stage === 2) { ellipse(x, px, py - 2, crop === 'potato' ? 9 : 6, 6); fs(x, col, 2); }
    } else if (kind === 'flower') {
      x.strokeStyle = '#558b2f'; x.lineWidth = 3; x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 34 * h); x.stroke();
      ellipse(x, px - 6, py - 12, 6, 3, 0.5); fs(x, '#7cb342', 1.5);
      if (stage === 2) { if (crop === 'lavender') { for (let k = 0; k < 4; k++) { ellipse(x, px, py - 36 - k * 5, 3.5, 3); fs(x, col, 1.2); } } else { for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ellipse(x, px + Math.cos(a) * 6, py - 36 + Math.sin(a) * 6, 4.5, 4.5); fs(x, col, 1.3); } ellipse(x, px, py - 36, 3.5, 3.5); x.fillStyle = crop === 'sunflower' ? '#6d4c41' : '#fff59d'; x.fill(); } }
      else { ellipse(x, px, py - 34 * h, 4, 5); fs(x, '#9ccc65', 1.5); }
    } else if (kind === 'vine') {
      ellipse(x, px, py - 8, 14 * h, 9 * h); fs(x, '#5fa046', 2);
      if (stage === 2) { ellipse(x, px + 2, py - 8, 13, 10); fs(x, col, 2.2); x.strokeStyle = shade(col, -0.2); x.lineWidth = 1.5; x.beginPath(); x.moveTo(px + 2, py - 18); x.lineTo(px + 2, py + 2); x.stroke(); }
    } else {
      ellipse(x, px, py - 12 * h, 13 * h + 3, 11 * h + 3); fs(x, crop === 'cotton' ? '#6d8a3a' : '#4f9a3c', 2);
      if (stage === 2) for (const [a, b] of [[-6, -16], [6, -12], [0, -6], [-4, -6]]) { ellipse(x, px + a, py + b, crop === 'cotton' ? 5 : 3.6, crop === 'cotton' ? 5 : 3.6); fs(x, col, 1.4); }
    }
  }
  if (stage === 2) { ellipse(x, S - 14, 18, 9, 9); fs(x, '#f2b632', 2.5); x.fillStyle = INK; x.font = 'bold 14px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', S - 14, 19); }
  return c;
}
