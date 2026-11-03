// Personagens cartoon (chibi) procedurais. Cada aparência vira uma spritesheet COLS×4:
// 0-1 parado (respiração) · 2-5 caminhada · 6-8 ferramenta · 9-10 agachado (plantar/colher)
// · 11-12 comemoração · 13-16 carregando. Linhas: 0 baixo, 1 esquerda, 2 direita (espelho), 3 cima.
// Frame 80×124 pintado a 2× (exibido a 0,5). Ver docs/ART_BIBLE.md.
import { cv, ell, fillOut, rr, shadow, shine, vol, shade, OUT, type Ctx } from './cartoon/paint.ts';

export interface Look { skin: number; hair: number; hairColor: number; shirt: number; shirtColor: number; pants: number; hat: number; hatColor: number; acc: number }

export const SKINS = ['#f8d8bd', '#eebd95', '#d49c6c', '#b5794b', '#8c5732', '#603b22'];
export const HAIR_STYLES = ['Curto', 'Cacheado', 'Rabo de cavalo', 'Tranças', 'Raspado', 'Black power'];
export const HAIR_COLORS = ['#2b1d14', '#5a3820', '#9a5b2e', '#d9a441', '#ecdcae', '#b8432f', '#7d8a96'];
export const SHIRT_STYLES = ['Camiseta', 'Xadrez', 'Macacão', 'Regata'];
export const CLOTH_COLORS = ['#dd4b50', '#3474c0', '#43a058', '#f4b83a', '#9152b8', '#ec8530', '#24447e', '#f7f6ef', '#ef97b7', '#575757'];
export const PANTS_COLORS = ['#35548a', '#5f4938', '#456a40', '#2a2f38', '#a76d3e', '#7f3541'];
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

export const FW = 80, FH = 124, COLS = 17, ROWS = 4;
/** Folga acima da cabeça (pulo, braços erguidos, fardo). */
const HEAD = 20;
/** Origem vertical do pé no quadro (0..1). */
export const FOOT = (97 + HEAD) / FH;
export type Pose = 'idle' | 'walk' | 'work' | 'crouch' | 'cheer' | 'carry';
/** Colunas de cada pose na folha: [início, quantidade]. */
export const POSES: Record<Pose, [number, number]> = { idle: [0, 2], walk: [2, 4], work: [6, 3], crouch: [9, 2], cheer: [11, 2], carry: [13, 4] };
type Dir = 0 | 1 | 3; // baixo, esquerda, cima (direita = espelho da esquerda)

const SHOE = '#5a3b26';

function drawFrame(x: Ctx, L: Look, dir: Dir, pose: Pose, f: number) {
  const skin = SKINS[L.skin], hairC = HAIR_COLORS[L.hairColor], shirtC = CLOTH_COLORS[L.shirtColor], pantsC = PANTS_COLORS[L.pants], hatC = CLOTH_COLORS[L.hatColor];
  const side = dir === 1, back = dir === 3, front = dir === 0;
  const walking = pose === 'walk' || pose === 'carry';
  const swing = walking ? [1, 0, -1, 0][f % 4] : 0;
  // deslocamentos: corpo (by), cabeça (hy extra) e pernas
  let by = 0, headDrop = 0;
  if (pose === 'idle') headDrop = f % 2;               // respiração
  if (walking) by = f % 2 ? -2.5 : 0;
  if (pose === 'crouch') by = 9 + (f % 2);
  if (pose === 'cheer') by = f % 2 ? -8 : 0;
  if (pose === 'work') by = [0, 1, 2][f % 3];
  const cx = 40, ground = 97;

  shadow(x, cx, ground, pose === 'cheer' && f % 2 ? 13 : 17, 5, 0.3);

  // mochila (atrás do corpo nas vistas de lado e costas)
  if (L.acc === 3 && (back || side)) {
    const bx = side ? cx + 6 : cx - 13;
    rr(x, bx, 58 + by, side ? 13 : 26, 22, 6); fillOut(x, vol(x, bx, 58, bx + 26, 80, '#9a6438'), 2);
    rr(x, bx + 3, 69 + by, side ? 8 : 20, 7, 3); fillOut(x, '#b37a46', 1.6);
  }
  // rabo de cavalo / tranças atrás (vista de frente aparecem nas laterais)
  const hy = 36 + by + headDrop;
  if (L.hair === 2 && !front) {
    const tx = side ? cx + 20 : cx;
    ell(x, tx, hy + 10, 6.5, 13, side ? 0.5 : 0); fillOut(x, vol(x, tx - 6, hy, tx + 6, hy + 24, hairC), 2);
  }

  // pernas
  const legTop = 76 + by;
  const legLen = pose === 'crouch' ? 10 : 15;
  const legs = (s: number, lift: number, dx: number) => {
    rr(x, cx + s * 6.5 - 5 + dx, legTop - lift, 10, legLen + 2, 4); fillOut(x, vol(x, cx - 10, legTop, cx + 10, legTop + 16, pantsC), 2);
    const sy = Math.min(ground - 5, legTop + legLen - lift);
    rr(x, cx + s * 6.5 - 6.5 + dx + (side ? -2 : 0), sy - 2, side ? 14 : 13, 7, 3.5); fillOut(x, vol(x, 0, sy - 2, 0, sy + 5, SHOE, 0.25, -0.2), 2);
  };
  if (side) { legs(0, 0, swing * 6); legs(0, 0, -swing * 6); }
  else { legs(-1, swing > 0 ? 3 : 0, 0); legs(1, swing < 0 ? 3 : 0, 0); }

  // tronco
  const bw = side ? 21 : 28, bt = 57 + by, bh = 23;
  rr(x, cx - bw / 2, bt, bw, bh, 9); fillOut(x, vol(x, cx - bw / 2, bt, cx + bw / 2, bt + bh, shirtC, 0.2, -0.22), 2.2);
  x.save(); rr(x, cx - bw / 2, bt, bw, bh, 9); x.clip();
  if (L.shirt === 1) { // xadrez
    x.fillStyle = 'rgba(0,0,0,.17)'; for (let i = -1; i < 5; i++) { x.fillRect(cx - bw / 2 + i * 7, bt, 3, bh); x.fillRect(cx - bw / 2, bt + 2 + i * 7, bw, 3); }
    x.fillStyle = 'rgba(255,255,255,.14)'; for (let i = -1; i < 5; i++) x.fillRect(cx - bw / 2 + i * 7 + 4, bt, 1.4, bh);
  } else if (L.shirt === 2) { // macacão
    x.fillStyle = shade(pantsC, 0.05); x.fillRect(cx - bw / 2, bt + 11, bw, bh);
    if (!back) { x.fillRect(cx - (side ? 4 : 9), bt, 5, 12); if (!side) x.fillRect(cx + 4, bt, 5, 12); }
    else { x.beginPath(); x.moveTo(cx - 9, bt); x.lineTo(cx + 5, bt + 12); x.lineTo(cx + 9, bt); x.lineTo(cx - 5, bt + 12); x.lineWidth = 4; x.strokeStyle = shade(pantsC, 0.05); x.stroke(); }
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(cx - bw / 2, bt + 11); x.lineTo(cx + bw / 2, bt + 11); x.stroke();
  } else if (L.shirt === 3 && !back) { // regata: ombros à mostra
    x.fillStyle = skin; if (!side) { x.fillRect(cx - bw / 2, bt, 6, 7); x.fillRect(cx + bw / 2 - 6, bt, 6, 7); } else x.fillRect(cx - 3, bt, 7, 6);
  }
  // sombra da cabeça sobre o tronco
  x.fillStyle = 'rgba(40,20,10,.16)'; x.fillRect(cx - bw / 2, bt, bw, 4);
  x.restore();
  if (L.shirt === 2 && front) { for (const s of [-1, 1]) { ell(x, cx + s * 6.5, bt + 11, 1.8, 1.8); fillOut(x, '#f4c84a', 1); } }
  if (L.acc === 4 && !back) { rr(x, cx - bw / 2 + 4, bt + 6, bw - 8, bh + 2, 4); fillOut(x, vol(x, 0, bt, 0, bt + 24, '#f8f5ea', 0.1, -0.12), 1.8); rr(x, cx - 4, bt + 13, 8, 5, 2); fillOut(x, '#e2d6bc', 1.2); }
  if (L.acc === 3 && front) { x.strokeStyle = '#6b3f22'; x.lineWidth = 3.4; x.beginPath(); x.moveTo(cx - 8, bt + 1); x.lineTo(cx - 8, bt + 17); x.moveTo(cx + 8, bt + 1); x.lineTo(cx + 8, bt + 17); x.stroke(); }

  // braços
  const armC = L.shirt === 3 ? skin : shirtC;
  const arm = (ax: number, ay: number, ang: number, len = 15) => {
    x.save(); x.translate(ax, ay); x.rotate(ang);
    rr(x, -4, -1, 8, len, 4); fillOut(x, vol(x, -4, 0, 4, len, armC), 2);
    ell(x, 0, len + 1, 4.6, 4.6); fillOut(x, vol(x, -4, len - 4, 4, len + 5, skin, 0.15, -0.15), 2);
    x.restore();
  };
  const tool = (ax: number, ay: number, ang: number) => {
    x.save(); x.translate(ax, ay); x.rotate(ang);
    rr(x, -2, 10, 4.4, 28, 2); fillOut(x, vol(x, -2, 0, 2, 0, '#a46b3c'), 1.8);
    x.beginPath(); x.moveTo(-9, 34); x.lineTo(9, 34); x.lineTo(7, 42); x.lineTo(-7, 41); x.closePath();
    fillOut(x, vol(x, -9, 34, 9, 42, '#aab3ba', 0.3, -0.2), 1.8);
    x.restore();
  };
  const shY = bt + 3;
  if (pose === 'carry') {
    arm(cx - bw / 2 + 2, shY, Math.PI - 0.32, 17); arm(cx + bw / 2 - 2, shY, Math.PI + 0.32, 17);
  } else if (pose === 'cheer') {
    const up = f % 2 ? 1.05 : 0.85;
    arm(cx - bw / 2 + 1, shY, Math.PI - up, 18); arm(cx + bw / 2 - 1, shY, Math.PI + up, 18);
  } else if (pose === 'work') {
    const ang = side ? [2.5, 1.2, 0.2][f % 3] : [-2.7, -1.4, -0.2][f % 3];
    const ax = side ? cx - 2 : cx + bw / 2 - 2;
    if (!side) arm(cx - bw / 2 + 2, shY, 0.35);
    if (back) { arm(ax, shY, ang); tool(ax, shY, ang); }
    else { tool(ax, shY, ang); arm(ax, shY, ang); }
  } else if (pose === 'crouch') {
    if (side) arm(cx - 4, shY, 0.9 + (f % 2) * 0.25, 15);
    else { arm(cx - bw / 2 + 2, shY, 0.15 - (f % 2) * 0.2, 15); arm(cx + bw / 2 - 2, shY, -0.15 + (f % 2) * 0.2, 15); }
  } else if (side) {
    arm(cx + 1, shY, swing * 0.55);
  } else {
    arm(cx - bw / 2 + 1, shY, 0.16 + swing * 0.28); arm(cx + bw / 2 - 1, shY, -0.16 - swing * 0.28);
  }
  if (L.acc === 2) { rr(x, cx - 12, bt - 3, 24, 8, 4); fillOut(x, CLOTH_COLORS[(L.shirtColor + 3) % CLOTH_COLORS.length], 1.8); if (front) { x.beginPath(); x.moveTo(cx - 3, bt + 4); x.lineTo(cx + 3, bt + 4); x.lineTo(cx, bt + 11); x.closePath(); fillOut(x, CLOTH_COLORS[(L.shirtColor + 3) % CLOTH_COLORS.length], 1.4); } }

  // ---------------------------------------------------------- cabeça
  if (L.hair === 5) { ell(x, cx + (side ? 3 : 0), hy - 6, 30, 26); fillOut(x, vol(x, cx - 30, hy - 30, cx + 30, hy + 20, hairC, 0.18, -0.2), 2.2); }
  if (L.hair === 3 && !back) for (const s of side ? [1] : [-1, 1]) { // tranças
    const bxp = cx + s * 20 + (side ? 2 : 0);
    for (let j = 0; j < 3; j++) { ell(x, bxp, hy + 6 + j * 7, 5, 4.6); fillOut(x, vol(x, bxp - 5, hy, bxp + 5, hy + 26, hairC), 1.7); }
    ell(x, bxp, hy + 27, 3, 3); fillOut(x, CLOTH_COLORS[L.shirtColor], 1.2);
  }
  // orelhas
  if (!back) for (const s of side ? [1] : [-1, 1]) { ell(x, cx + s * 22 + (side ? -6 : 0), hy + 3, 4.6, 5.6); fillOut(x, shade(skin, -0.06), 2); }
  ell(x, cx, hy, 23, 21);
  fillOut(x, vol(x, cx - 22, hy - 20, cx + 20, hy + 22, skin, 0.14, -0.14), 2.4);

  // rosto
  if (!back) {
    const happy = pose === 'cheer' || (pose === 'carry' && f % 4 === 1);
    const focus = pose === 'work' || pose === 'crouch';
    const eyes: number[] = side ? [cx - 11] : [cx - 9, cx + 9];
    const ey = hy + 4;
    x.fillStyle = 'rgba(236,120,110,.42)';
    for (const ex of side ? [cx - 6] : [cx - 14, cx + 14]) { ell(x, ex, hy + 11, 4.4, 2.6); x.fill(); }
    for (const ex of eyes) {
      if (happy) { x.beginPath(); x.arc(ex, ey + 1.5, 3.4, Math.PI * 1.1, Math.PI * 1.9); x.lineWidth = 2.4; x.strokeStyle = '#2b1d14'; x.stroke(); continue; }
      ell(x, ex, ey, 3.5, focus ? 3.4 : 4.8); x.fillStyle = '#2b1d14'; x.fill();
      ell(x, ex + 1.1, ey - 1.6, 1.5, 1.7); x.fillStyle = '#fff'; x.fill();
      ell(x, ex - 1, ey + 2, 0.8, 0.8); x.fillStyle = 'rgba(255,255,255,.7)'; x.fill();
    }
    // sobrancelhas
    x.strokeStyle = shade(hairC, -0.25); x.lineWidth = 2;
    for (const ex of eyes) { x.beginPath(); x.moveTo(ex - 3.5, ey - 8 + (focus ? 1.2 : 0)); x.quadraticCurveTo(ex, ey - 9.5, ex + 3.5, ey - 8 - (focus ? 0.6 : 0)); x.stroke(); }
    // boca
    const mx = side ? cx - 12 : cx, my = hy + 12;
    x.strokeStyle = '#5a2a1c'; x.lineWidth = 1.9;
    if (happy) { x.beginPath(); x.moveTo(mx - 4.5, my - 1); x.quadraticCurveTo(mx, my + 7, mx + 4.5, my - 1); x.closePath(); fillOut(x, '#a8383a', 1.6, '#5a2a1c'); ell(x, mx, my + 3, 2, 1.2); x.fillStyle = '#f28b8b'; x.fill(); }
    else if (focus) { x.beginPath(); x.moveTo(mx - 2.5, my + 1); x.lineTo(mx + 2.5, my + 0.4); x.stroke(); }
    else { x.beginPath(); x.arc(mx, my - 1.5, 3.6, 0.35, Math.PI - 0.35); x.stroke(); }
    if (side) { x.beginPath(); x.moveTo(cx - 22, hy + 4); x.quadraticCurveTo(cx - 25.5, hy + 7, cx - 22, hy + 8.5); x.strokeStyle = shade(skin, -0.3); x.lineWidth = 1.6; x.stroke(); }
    if (L.acc === 1) { // óculos
      x.strokeStyle = '#3a2a22'; x.lineWidth = 2;
      for (const ex of eyes) { rr(x, ex - 6, ey - 5, 12, 10, 4); x.stroke(); x.fillStyle = 'rgba(200,230,255,.22)'; x.fill(); }
      if (!side) { x.beginPath(); x.moveTo(cx - 3, ey - 1); x.lineTo(cx + 3, ey - 1); x.stroke(); }
      else { x.beginPath(); x.moveTo(cx - 5, ey - 1); x.lineTo(cx + 12, ey - 3); x.stroke(); }
    }
  }

  // cabelo (frente/topo)
  const hairFill = vol(x, cx - 24, hy - 24, cx + 22, hy + 10, hairC, 0.22, -0.18);
  const capPath = (ext = 0) => { x.beginPath(); x.ellipse(cx, hy - 2, 24.5 + ext, 22 + ext, 0, Math.PI * 0.94, Math.PI * 2.06); x.closePath(); };
  if (L.hair === 4) { capPath(-1); x.globalAlpha = 0.55; x.fillStyle = hairC; x.fill(); x.globalAlpha = 1; }
  else if (back) {
    ell(x, cx, hy - 1, 24.5, 22); fillOut(x, hairFill, 2.4);
    x.strokeStyle = 'rgba(0,0,0,.16)'; x.lineWidth = 1.6; for (const a of [-0.5, 0, 0.5]) { x.beginPath(); x.moveTo(cx + a * 8, hy - 20); x.quadraticCurveTo(cx + a * 22, hy, cx + a * 18, hy + 16); x.stroke(); }
    if (L.hair === 3) for (const s of [-1, 1]) for (let j = 0; j < 3; j++) { ell(x, cx + s * 12, hy + 20 + j * 7, 5, 4.6); fillOut(x, hairFill, 1.7); }
  } else if (L.hair === 1 || L.hair === 5) {
    const n = 9;
    for (let i = 0; i < n; i++) { const a = Math.PI * 1.02 + (i / (n - 1)) * Math.PI * 0.96; ell(x, cx + Math.cos(a) * 19 + (side ? 3 : 0), hy - 4 + Math.sin(a) * 17, 8, 7); fillOut(x, hairFill, 1.8); }
    if (side) { ell(x, cx + 15, hy + 2, 9, 12); fillOut(x, hairFill, 1.8); }
  } else {
    capPath(); fillOut(x, hairFill, 2.4);
    if (side) {
      x.beginPath(); x.ellipse(cx + 8, hy + 1, 16, 17, 0, -Math.PI / 2, Math.PI / 2); x.closePath(); fillOut(x, hairFill, 2.2);
      x.beginPath(); x.moveTo(cx - 24, hy - 4); x.quadraticCurveTo(cx - 14, hy - 4, cx - 8, hy - 14); x.lineTo(cx - 6, hy - 22); x.lineTo(cx - 22, hy - 16); x.closePath(); x.fillStyle = hairFill; x.fill();
    } else {
      // franja em três mechas
      x.beginPath(); x.moveTo(cx - 24, hy - 1);
      x.quadraticCurveTo(cx - 17, hy - 2, cx - 13, hy - 10); x.quadraticCurveTo(cx - 6, hy - 3, cx + 1, hy - 11);
      x.quadraticCurveTo(cx + 8, hy - 4, cx + 15, hy - 9); x.quadraticCurveTo(cx + 19, hy - 2, cx + 24, hy - 1);
      x.lineTo(cx + 24, hy - 12); x.lineTo(cx - 24, hy - 12); x.closePath(); x.fillStyle = hairFill; x.fill();
      x.strokeStyle = OUT; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 24, hy - 1);
      x.quadraticCurveTo(cx - 17, hy - 2, cx - 13, hy - 10); x.quadraticCurveTo(cx - 6, hy - 3, cx + 1, hy - 11);
      x.quadraticCurveTo(cx + 8, hy - 4, cx + 15, hy - 9); x.quadraticCurveTo(cx + 19, hy - 2, cx + 24, hy - 1); x.stroke();
      if (L.hair === 2) { ell(x, cx + 22, hy + 2, 4.5, 9, 0.3); fillOut(x, hairFill, 1.8); }
    }
    shine(x, cx - 8, hy - 15, 8, 2.6, 0.3, -0.25);
  }

  // chapéu
  const hatY = hy - 15;
  if (L.hat === 1 || L.hat === 4) {
    ell(x, cx, hatY + 5, 33, 10); fillOut(x, vol(x, cx - 33, hatY, cx + 33, hatY + 14, '#ecc66e', 0.18, -0.2), 2.2);
    x.strokeStyle = 'rgba(140,95,30,.35)'; x.lineWidth = 1.2; ell(x, cx, hatY + 5, 26, 7.4); x.stroke();
    x.beginPath(); x.ellipse(cx, hatY + 3, 18, 15, 0, Math.PI, 0); x.closePath(); fillOut(x, vol(x, cx - 18, hatY - 12, cx + 18, hatY + 3, '#f3d58a', 0.2, -0.16), 2.2);
    rr(x, cx - 18, hatY - 2, 36, 5.5, 2.5); fillOut(x, hatC, 1.6);
    if (L.hat === 4) { const fx = cx + 12, fy = hatY - 3; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ell(x, fx + Math.cos(a) * 4.4, fy + Math.sin(a) * 4.4, 3.4, 3.4); fillOut(x, '#ef5b8e', 1.2); } ell(x, fx, fy, 2.4, 2.4); fillOut(x, '#ffd54f', 1); }
  } else if (L.hat === 2) {
    x.beginPath(); x.ellipse(cx, hatY + 5, 21, 16, 0, Math.PI, 0); x.closePath(); fillOut(x, vol(x, cx - 21, hatY - 12, cx + 21, hatY + 5, hatC), 2.2);
    ell(x, cx, hatY - 10, 2.6, 2); fillOut(x, shade(hatC, -0.2), 1.2);
    if (front) { ell(x, cx, hatY + 7, 18, 5.4); fillOut(x, shade(hatC, -0.18), 2); }
    else if (side) { ell(x, cx - 20, hatY + 5, 11, 4); fillOut(x, shade(hatC, -0.18), 2); }
  } else if (L.hat === 3) {
    x.beginPath(); x.ellipse(cx, hatY + 8, 23.5, 15, 0, Math.PI, 0); x.closePath(); fillOut(x, vol(x, cx - 22, hatY - 8, cx + 22, hatY + 8, hatC), 2.2);
    x.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 6; i++) { ell(x, cx - 15 + i * 6, hatY + 1 + (i % 2) * 3, 1.5, 1.5); x.fill(); }
    if (!front) { ell(x, side ? cx + 22 : cx, hatY + 10, 5, 4); fillOut(x, hatC, 1.8); }
  } else if (L.hat === 5) {
    x.beginPath(); x.ellipse(cx, hatY + 8, 23.5, 20, 0, Math.PI, 0); x.closePath(); fillOut(x, vol(x, cx - 22, hatY - 12, cx + 22, hatY + 8, hatC), 2.2);
    rr(x, cx - 24, hatY + 3, 48, 8, 4); fillOut(x, shade(hatC, -0.15), 2);
    ell(x, cx, hatY - 13, 6, 6); fillOut(x, '#f7f6ef', 1.8);
  }

  // fardo carregado sobre a cabeça
  if (pose === 'carry') {
    const cy0 = hy - 40;
    rr(x, cx - 17, cy0, 34, 18, 4); fillOut(x, vol(x, cx - 17, cy0, cx + 17, cy0 + 18, '#c99a5c'), 2.2);
    x.strokeStyle = 'rgba(90,55,25,.6)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx - 17, cy0 + 9); x.lineTo(cx + 17, cy0 + 9); x.stroke();
    ell(x, cx - 6, cy0 - 1, 5, 4); fillOut(x, '#e4513f', 1.4); ell(x, cx + 5, cy0 - 1, 5, 4); fillOut(x, '#f2b632', 1.4);
  }
}

function frameAt(x: Ctx, look: Look, row: number, pose: Pose, f: number) {
  x.translate(0, HEAD);
  if (row === 2) { x.translate(FW, 0); x.scale(-1, 1); drawFrame(x, look, 1, pose, f); }
  else drawFrame(x, look, (row === 3 ? 3 : row) as Dir, pose, f);
}

/** Gera a spritesheet completa para uma aparência. */
export function buildSheet(look: Look): HTMLCanvasElement {
  const { c, x } = cv(FW * COLS, FH * ROWS);
  for (let row = 0; row < ROWS; row++) {
    for (const [pose, [start, n]] of Object.entries(POSES) as [Pose, [number, number]][]) {
      for (let f = 0; f < n; f++) {
        x.save(); x.translate((start + f) * FW, row * FH); frameAt(x, look, row, pose, f); x.restore();
      }
    }
  }
  return c;
}

/** Um quadro avulso (prévia animada do editor). row: 0 baixo, 1 esquerda, 2 direita, 3 cima. */
export function drawPreview(target: HTMLCanvasElement, look: Look, row: number, pose: Pose, f: number) {
  const x = target.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, target.width, target.height);
  x.lineJoin = 'round'; x.lineCap = 'round';
  x.scale(target.width / FW, target.height / FH);
  frameAt(x, look, row, pose, f);
}

/** Retrato para a interface (frame parado, de frente). */
export function portrait(look: Look, scale = 1): HTMLCanvasElement {
  const { c, x } = cv(FW * scale, FH * scale);
  x.scale(scale, scale);
  frameAt(x, look, 0, 'idle', 0);
  return c;
}

/** Folha de contato de QA: várias aparências e poses. */
export function allCharacterArts() {
  const looks: Look[] = [DEFAULT_LOOK,
    { skin: 4, hair: 5, hairColor: 0, shirt: 1, shirtColor: 2, pants: 3, hat: 0, hatColor: 3, acc: 4 },
    { skin: 0, hair: 2, hairColor: 3, shirt: 2, shirtColor: 7, pants: 0, hat: 2, hatColor: 1, acc: 1 },
    { skin: 2, hair: 3, hairColor: 5, shirt: 3, shirtColor: 8, pants: 4, hat: 4, hatColor: 0, acc: 2 },
    { skin: 5, hair: 1, hairColor: 6, shirt: 0, shirtColor: 6, pants: 2, hat: 5, hatColor: 0, acc: 3 },
    { skin: 3, hair: 4, hairColor: 0, shirt: 1, shirtColor: 5, pants: 5, hat: 3, hatColor: 4, acc: 0 }];
  const out: Record<string, { c: HTMLCanvasElement; ox: number; oy: number }> = {};
  looks.forEach((l, i) => {
    const sheet = buildSheet(l);
    for (const [name, col, row] of [['idle', 0, 0], ['walk', 3, 0], ['side', 3, 1], ['back', 2, 3], ['work', 6, 0], ['hit', 8, 1], ['crouch', 9, 0], ['cheer', 12, 0], ['carry', 14, 2]] as const) {
      const { c, x } = cv(FW, FH); x.drawImage(sheet, col * FW, row * FH, FW, FH, 0, 0, FW, FH);
      out[`${i}_${name}`] = { c, ox: 0.5, oy: 1 };
    }
  });
  return out;
}
