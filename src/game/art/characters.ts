// Personagens procedurais. Cada aparência vira uma spritesheet 12x4:
// colunas 0-1 parado, 2-5 caminhada, 6-7 trabalho (golpe), 8-11 carregando.
// linhas: 0 baixo, 1 esquerda, 2 direita, 3 cima. Frame 64x96 (exibido a 0.5x).
import { canvas, ellipse, fs, rrect, shade, INK, groundShadow } from './draw.ts';

export interface Look { skin: number; hair: number; hairColor: number; shirt: number; shirtColor: number; pants: number; hat: number; hatColor: number; acc: number }

export const SKINS = ['#f6d3b3', '#eab88f', '#d39a6a', '#b07548', '#8a5530', '#5e3a22'];
export const HAIR_STYLES = ['Curto', 'Cacheado', 'Rabo de cavalo', 'Tranças', 'Raspado', 'Black power'];
export const HAIR_COLORS = ['#2b1d14', '#5a3820', '#9a5b2e', '#d9a441', '#e8d8a8', '#b23a2a', '#7d8a96'];
export const SHIRT_STYLES = ['Camiseta', 'Xadrez', 'Macacão', 'Regata'];
export const CLOTH_COLORS = ['#d8434b', '#2f6db5', '#3f8f4f', '#f2b632', '#8e44ad', '#e67e22', '#1d3b72', '#f7f8f4', '#e88fb0', '#4a4a4a'];
export const PANTS_COLORS = ['#2f4a7a', '#5b4636', '#3d5e3a', '#22262e', '#a0673a', '#7a2f3a'];
export const HATS = ['Nenhum', 'Chapéu de palha', 'Boné', 'Lenço', 'Chapéu com flor', 'Gorro'];
export const ACCESSORIES = ['Nenhum', 'Óculos', 'Lenço no pescoço', 'Mochila', 'Avental'];

export const DEFAULT_LOOK: Look = { skin: 1, hair: 0, hairColor: 1, shirt: 0, shirtColor: 0, pants: 0, hat: 1, hatColor: 3, acc: 0 };

export const LOOK_LIMITS: Record<keyof Look, number> = {
  skin: SKINS.length, hair: HAIR_STYLES.length, hairColor: HAIR_COLORS.length, shirt: SHIRT_STYLES.length,
  shirtColor: CLOTH_COLORS.length, pants: PANTS_COLORS.length, hat: HATS.length, hatColor: CLOTH_COLORS.length, acc: ACCESSORIES.length,
};

/** Normaliza o que vem do banco (pode ser {} ou ter valores fora do intervalo). */
export function normalizeLook(raw: unknown): Look {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_LOOK };
  for (const k of Object.keys(LOOK_LIMITS) as (keyof Look)[]) {
    const v = Number(o[k]);
    if (Number.isInteger(v) && v >= 0 && v < LOOK_LIMITS[k]) out[k] = v;
  }
  return out;
}

export const lookKey = (l: Look) => Object.values(l).join('-');

export const FW = 64, FH = 96, COLS = 12, ROWS = 4;
type Dir = 0 | 1 | 2 | 3; // baixo, esquerda, direita, cima
type Pose = 'idle' | 'walk' | 'work' | 'carry';

function drawFrame(x: CanvasRenderingContext2D, L: Look, dir: Dir, pose: Pose, f: number) {
  const skin = SKINS[L.skin], hairC = HAIR_COLORS[L.hairColor], shirtC = CLOTH_COLORS[L.shirtColor], pantsC = PANTS_COLORS[L.pants], hatC = CLOTH_COLORS[L.hatColor];
  const side = dir === 1 || dir === 2;
  const back = dir === 3;
  const walkPhase = pose === 'walk' || pose === 'carry' ? [0, 1, 0, -1][f % 4] : 0;
  const bob = pose === 'idle' ? (f % 2) : Math.abs(walkPhase);
  const by = 0 - bob; // deslocamento vertical do corpo

  groundShadow(x, 32, 90, 15, 5, 0.25);

  // pernas
  const legY = 70 + by;
  if (side) {
    for (const s of [-1, 1]) {
      const off = walkPhase * 5 * s;
      rrect(x, 27 + off, legY, 9, 18, 4); fs(x, pantsC, 2);
      rrect(x, 26 + off + (dir === 1 ? -2 : 1), 84 + by * 0.3, 12, 6, 3); fs(x, '#4a3426', 2);
    }
  } else {
    for (const s of [-1, 1]) {
      const lift = walkPhase * s > 0 ? 3 : 0;
      rrect(x, 32 + s * 6 - 5, legY - lift, 10, 18, 4); fs(x, pantsC, 2);
      rrect(x, 32 + s * 6 - 6, 84 - lift + by * 0.3, 12, 6, 3); fs(x, '#4a3426', 2);
    }
  }

  // mochila atrás (frente: alças)
  if (L.acc === 3 && (back || side)) {
    const bx = side ? (dir === 1 ? 40 : 14) : 20;
    rrect(x, bx, 50 + by, side ? 12 : 24, 20, 5); fs(x, '#8d5a33', 2);
    rrect(x, bx + 2, 60 + by, side ? 8 : 20, 6, 2); fs(x, '#a0673a', 1.5);
  }

  // corpo
  const bodyW = side ? 20 : 26;
  rrect(x, 32 - bodyW / 2, 48 + by, bodyW, 26, 8); fs(x, shirtC, 2.2);
  if (L.shirt === 1) { // xadrez
    x.save(); rrect(x, 32 - bodyW / 2, 48 + by, bodyW, 26, 8); x.clip();
    x.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 4; i++) { x.fillRect(32 - bodyW / 2 + i * 7, 48 + by, 3, 26); x.fillRect(32 - bodyW / 2, 50 + by + i * 7, bodyW, 3); }
    x.restore(); rrect(x, 32 - bodyW / 2, 48 + by, bodyW, 26, 8); x.lineWidth = 2.2; x.strokeStyle = INK; x.stroke();
  } else if (L.shirt === 2) { // macacão
    rrect(x, 32 - bodyW / 2 + 2, 58 + by, bodyW - 4, 16, 5); fs(x, pantsC, 2);
    if (!side) { x.fillStyle = pantsC; x.fillRect(24, 48 + by, 4, 12); x.fillRect(36, 48 + by, 4, 12); ellipse(x, 26, 58 + by, 1.6, 1.6); x.fillStyle = '#f2c230'; x.fill(); ellipse(x, 38, 58 + by, 1.6, 1.6); x.fill(); }
  } else if (L.shirt === 3 && !back) { // regata: ombros à mostra
    x.fillStyle = skin; if (!side) { x.fillRect(20, 50 + by, 4, 6); x.fillRect(40, 50 + by, 4, 6); }
  }
  if (L.acc === 4 && !back) { rrect(x, 32 - bodyW / 2 + 3, 54 + by, bodyW - 6, 22, 4); fs(x, '#f7f8f4', 1.8); rrect(x, 28, 60 + by, 8, 5, 2); fs(x, '#e0d6c0', 1.2); }
  if (L.acc === 3 && !side && !back) { x.strokeStyle = '#6b3f22'; x.lineWidth = 3; x.beginPath(); x.moveTo(24, 49 + by); x.lineTo(24, 66 + by); x.moveTo(40, 49 + by); x.lineTo(40, 66 + by); x.stroke(); }

  // braços
  const armC = L.shirt === 3 ? skin : shirtC;
  const arm = (ax: number, ay: number, ang: number, len = 18) => {
    x.save(); x.translate(ax, ay); x.rotate(ang);
    rrect(x, -4, 0, 8, len, 4); fs(x, armC, 2);
    ellipse(x, 0, len + 1, 4.5, 4.5); fs(x, skin, 2);
    x.restore();
  };
  if (pose === 'carry') {
    // braços para cima segurando um fardo sobre a cabeça
    arm(20, 52 + by, Math.PI - 0.35, 20); arm(44, 52 + by, Math.PI + 0.35, 20);
  } else if (pose === 'work') {
    const up = f % 2 === 0;
    const toolArm = dir === 1 ? 26 : 38;
    const ang = side ? (up ? (dir === 1 ? 2.4 : -2.4) : (dir === 1 ? 1.2 : -1.2)) : (up ? -2.6 : -0.4);
    x.save(); x.translate(toolArm, 52 + by); x.rotate(ang);
    rrect(x, -2, 8, 4, 26, 2); fs(x, '#8d5a33', 1.8); // cabo
    rrect(x, -8, 30, 16, 7, 2); fs(x, '#9ea7ad', 1.8); // cabeça da ferramenta
    x.restore();
    arm(toolArm, 52 + by, ang);
    if (!side) arm(64 - toolArm, 52 + by, toolArm > 32 ? 0.25 : -0.25);
  } else if (side) {
    arm(32, 52 + by, walkPhase * 0.6);
  } else {
    arm(19, 52 + by, 0.18 + walkPhase * 0.3); arm(45, 52 + by, -0.18 - walkPhase * 0.3);
  }

  // cabeça
  const hy = 32 + by;
  if (L.hair === 5) { ellipse(x, 32, hy - 4, 22, 20); fs(x, hairC, 2.2); } // black power atrás
  if (L.hair === 2 && (side || back)) { // rabo de cavalo
    const tx = side ? (dir === 1 ? 46 : 18) : 32;
    ellipse(x, tx, hy + 6, 5, 11, dir === 1 ? -0.4 : dir === 2 ? 0.4 : 0); fs(x, hairC, 2);
  }
  ellipse(x, 32, hy, 17, 16); fs(x, skin, 2.2);
  if (L.acc === 2) { rrect(x, 20, 45 + by, 24, 7, 3); fs(x, CLOTH_COLORS[(L.shirtColor + 3) % CLOTH_COLORS.length], 1.8); }

  // rosto
  if (!back) {
    x.fillStyle = INK;
    if (side) {
      const ex = dir === 1 ? 23 : 41;
      ellipse(x, ex, hy + 2, 2, 2.6); x.fill();
      ellipse(x, ex + (dir === 1 ? 2 : -2), hy + 9, 3, 1.6); x.fillStyle = 'rgba(230,110,110,.45)'; x.fill();
    } else {
      ellipse(x, 26, hy + 2, 2, 2.6); x.fill(); ellipse(x, 38, hy + 2, 2, 2.6); x.fill();
      x.fillStyle = 'rgba(230,110,110,.45)'; ellipse(x, 22, hy + 8, 3.2, 2); x.fill(); ellipse(x, 42, hy + 8, 3.2, 2); x.fill();
      x.beginPath(); x.arc(32, hy + 7, 3.5, 0.2, Math.PI - 0.2); x.lineWidth = 1.8; x.strokeStyle = INK; x.stroke();
    }
    if (L.acc === 1) {
      x.strokeStyle = '#2b2b2b'; x.lineWidth = 2;
      if (side) { const ex = dir === 1 ? 23 : 41; ellipse(x, ex, hy + 2, 5, 4.5); x.stroke(); }
      else { ellipse(x, 26, hy + 2, 5, 4.5); x.stroke(); ellipse(x, 38, hy + 2, 5, 4.5); x.stroke(); x.beginPath(); x.moveTo(31, hy + 2); x.lineTo(33, hy + 2); x.stroke(); }
    }
  }

  // cabelo
  x.save();
  const cap = (ext: number) => { x.beginPath(); x.ellipse(32, hy - 2, 18, 15 + ext, 0, Math.PI * 0.95, Math.PI * 2.05); x.closePath(); };
  if (L.hair === 4) { cap(-6); x.fillStyle = shade(hairC, 0.15); x.globalAlpha = 0.85; x.fill(); x.globalAlpha = 1; }
  else if (back) { ellipse(x, 32, hy - 1, 18, 16); fs(x, hairC, 2.2); }
  else if (L.hair === 1 || L.hair === 5) {
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; ellipse(x, 32 + Math.cos(a) * 14, hy - 4 + Math.sin(a) * 12, 7, 6); fs(x, hairC, 1.8); }
  } else {
    cap(0); fs(x, hairC, 2.2);
    if (!side) { x.beginPath(); x.moveTo(17, hy - 2); x.quadraticCurveTo(26, hy - 4, 30, hy - 10); x.quadraticCurveTo(34, hy - 3, 47, hy - 2); x.lineTo(47, hy - 8); x.lineTo(17, hy - 8); x.closePath(); x.fillStyle = hairC; x.fill(); }
    else { ellipse(x, dir === 1 ? 42 : 22, hy + 1, 7, 11); fs(x, hairC, 2); }
  }
  if (L.hair === 3) { for (const s of side ? [dir === 1 ? 1 : -1] : [-1, 1]) { rrect(x, 32 + s * 15 - 3, hy, 7, 22, 3); fs(x, hairC, 1.8); ellipse(x, 32 + s * 15 + 0.5, hy + 23, 3, 3); fs(x, CLOTH_COLORS[L.shirtColor], 1.2); } }
  x.restore();

  // chapéu
  const hatY = hy - 12;
  if (L.hat === 1 || L.hat === 4) {
    ellipse(x, 32, hatY + 4, 27, 8); fs(x, '#e8c36a', 2.2);
    x.beginPath(); x.ellipse(32, hatY + 2, 15, 12, 0, Math.PI, 0); x.closePath(); fs(x, '#f0d283', 2.2);
    rrect(x, 17, hatY - 1, 30, 5, 2); fs(x, hatC, 1.6);
    if (L.hat === 4) { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ellipse(x, 42 + Math.cos(a) * 4, hatY + Math.sin(a) * 4, 3, 3); fs(x, '#ec407a', 1.2); } ellipse(x, 42, hatY, 2, 2); x.fillStyle = '#ffd54f'; x.fill(); }
  } else if (L.hat === 2) {
    x.beginPath(); x.ellipse(32, hatY + 4, 17, 13, 0, Math.PI, 0); x.closePath(); fs(x, hatC, 2.2);
    if (!back) { if (side) { ellipse(x, dir === 1 ? 16 : 48, hatY + 4, 9, 3.5); fs(x, shade(hatC, -0.2), 2); } else { ellipse(x, 32, hatY + 6, 15, 5); fs(x, shade(hatC, -0.2), 2); } }
  } else if (L.hat === 3) {
    x.beginPath(); x.ellipse(32, hatY + 6, 18, 12, 0, Math.PI, 0); x.closePath(); fs(x, hatC, 2.2);
    x.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 5; i++) { ellipse(x, 20 + i * 6, hatY + 1, 1.4, 1.4); x.fill(); }
    if (back || side) { ellipse(x, side ? (dir === 1 ? 48 : 16) : 32, hatY + 8, 5, 4); fs(x, hatC, 1.8); }
  } else if (L.hat === 5) {
    x.beginPath(); x.ellipse(32, hatY + 6, 18, 16, 0, Math.PI, 0); x.closePath(); fs(x, hatC, 2.2);
    rrect(x, 14, hatY + 2, 36, 7, 3); fs(x, shade(hatC, -0.15), 2); ellipse(x, 32, hatY - 10, 5, 5); fs(x, '#f7f8f4', 1.8);
  }

  // fardo carregado
  if (pose === 'carry') {
    rrect(x, 16, 2 + by, 32, 16, 5); fs(x, '#c8a46e', 2.2);
    x.strokeStyle = '#8d6e44'; x.lineWidth = 2; x.beginPath(); x.moveTo(32, 2 + by); x.lineTo(32, 18 + by); x.stroke();
  }
}

/** Gera a spritesheet completa (768x384) para uma aparência. */
export function buildSheet(look: Look): HTMLCanvasElement {
  const { c, ctx } = canvas(FW * COLS, FH * ROWS);
  const poses: [Pose, number][] = [['idle', 0], ['idle', 1], ['walk', 0], ['walk', 1], ['walk', 2], ['walk', 3], ['work', 0], ['work', 1], ['carry', 0], ['carry', 1], ['carry', 2], ['carry', 3]];
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    poses.forEach(([pose, f], col) => {
      ctx.save();
      ctx.translate(col * FW, d * FH);
      if (d === 2) { ctx.translate(FW, 0); ctx.scale(-1, 1); drawFrame(ctx, look, 1, pose, f); }
      else drawFrame(ctx, look, d, pose, f);
      ctx.restore();
    });
  }
  return c;
}

/** Retrato para a interface (frame parado, de frente). */
export function portrait(look: Look, scale = 1): HTMLCanvasElement {
  const { c, ctx } = canvas(FW * scale, FH * scale);
  ctx.scale(scale, scale);
  drawFrame(ctx, look, 0, 'idle', 0);
  return c;
}
