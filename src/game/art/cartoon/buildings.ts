// Construções cartoon em 3/4 frontal (fachada + telhado vistos de cima e de frente).
// Grade retangular: o lote w×h tiles fica alinhado aos eixos; o telhado sobe acima do lote.
import { BUILDINGS, RECIPES, type BuildingDef } from '../../../data/catalog.ts';
import { ITEM_BY_ID } from '../../../data/items.ts';
import { mulberry } from '../draw.ts';
import { drawIcon } from '../icons.ts';
import { cv, ell, rr, vol, sphere, fillOut, shadow, shine, shade, OUT, type Ctx } from './paint.ts';

export interface BuildingArt { c: HTMLCanvasElement; ox: number; oy: number; anchors: Record<string, [number, number]> }

const T = 64; // px de tile a 2x
const ML = 14, MR = 34, MB = 12;

type Mat = 'plank' | 'brick' | 'plaster' | 'stone';
interface Spec { roof: 'gable' | 'hip' | 'barn' | 'flat' | 'dome' | 'shed'; mat: Mat; rise: number; chimney?: boolean; extra?: (x: Ctx, W: number, H: number, wallTop: number) => void }

const SPECS: Record<string, Spec> = {
  farmhouse: { roof: 'gable', mat: 'plank', rise: 70, chimney: true },
  barn: { roof: 'barn', mat: 'plank', rise: 86 },
  workbench: { roof: 'shed', mat: 'plank', rise: 0 },
  sawmill: { roof: 'shed', mat: 'plank', rise: 46 },
  mill: { roof: 'hip', mat: 'stone', rise: 120 },
  bakery: { roof: 'gable', mat: 'plaster', rise: 62, chimney: true },
  carpentry: { roof: 'gable', mat: 'plank', rise: 48 },
  kitchen: { roof: 'gable', mat: 'plaster', rise: 58, chimney: true },
  weaving: { roof: 'hip', mat: 'plaster', rise: 58 },
  toolshed: { roof: 'shed', mat: 'plank', rise: 40 },
  pottery: { roof: 'dome', mat: 'brick', rise: 58, chimney: true },
  glassworks: { roof: 'flat', mat: 'brick', rise: 30, chimney: true },
  oil_press: { roof: 'gable', mat: 'stone', rise: 56 },
  warehouse: { roof: 'barn', mat: 'brick', rise: 70 },
  foundry: { roof: 'flat', mat: 'brick', rise: 34, chimney: true },
  smithy: { roof: 'gable', mat: 'stone', rise: 54, chimney: true },
  great_workshop: { roof: 'barn', mat: 'plank', rise: 96 },
  florist: { roof: 'gable', mat: 'plaster', rise: 58 },
  jewelry: { roof: 'hip', mat: 'stone', rise: 66 },
};

// ---------------------------------------------------------------- partes
function wall(x: Ctx, X: number, Y: number, w: number, h: number, col: string, mat: Mat) {
  rr(x, X, Y, w, h, 4); fillOut(x, vol(x, X, Y, X + w * 0.6, Y + h, col, 0.14, -0.2));
  x.save(); rr(x, X, Y, w, h, 4); x.clip();
  if (mat === 'plank') {
    x.strokeStyle = shade(col, -0.16); x.lineWidth = 1.6;
    for (let yy = Y + 12; yy < Y + h; yy += 12) { x.beginPath(); x.moveTo(X, yy); x.lineTo(X + w, yy); x.stroke(); }
    const r = mulberry(w + h);
    for (let yy = Y; yy < Y + h; yy += 12) { const k = X + 20 + r() * (w - 40); x.beginPath(); x.moveTo(k, yy); x.lineTo(k, yy + 12); x.stroke(); }
  } else if (mat === 'brick') {
    x.strokeStyle = shade(col, -0.22); x.lineWidth = 1.4;
    for (let row = 0, yy = Y + 10; yy < Y + h; yy += 10, row++) {
      x.beginPath(); x.moveTo(X, yy); x.lineTo(X + w, yy); x.stroke();
      for (let xx = X + (row % 2 ? 10 : 0); xx < X + w; xx += 20) { x.beginPath(); x.moveTo(xx, yy - 10); x.lineTo(xx, yy); x.stroke(); }
    }
  } else if (mat === 'stone') {
    const r = mulberry(w * 3 + h);
    for (let i = 0; i < (w * h) / 260; i++) { ell(x, X + r() * w, Y + r() * h, 6 + r() * 6, 4 + r() * 3); x.fillStyle = shade(col, (r() - 0.5) * 0.16); x.fill(); x.strokeStyle = shade(col, -0.25); x.lineWidth = 1; x.stroke(); }
  } else {
    // reboco com madeira aparente
    x.strokeStyle = '#8d5a33'; x.lineWidth = 5;
    x.beginPath(); x.moveTo(X, Y + 5); x.lineTo(X + w, Y + 5); x.moveTo(X + 6, Y); x.lineTo(X + 6, Y + h); x.moveTo(X + w - 6, Y); x.lineTo(X + w - 6, Y + h); x.stroke();
  }
  // sombra do beiral e rodapé de pedra
  const g = x.createLinearGradient(0, Y, 0, Y + 16); g.addColorStop(0, 'rgba(40,25,15,.35)'); g.addColorStop(1, 'rgba(40,25,15,0)');
  x.fillStyle = g; x.fillRect(X, Y, w, 16);
  x.restore();
  rr(x, X - 2, Y + h - 10, w + 4, 12, 3); fillOut(x, vol(x, X, Y + h - 10, X + w, Y + h + 2, '#9aa0a6'), 1.8);
}

function door(x: Ctx, cx: number, base: number, w: number, h: number, col: string) {
  rr(x, cx - w / 2 - 5, base - h - 5, w + 10, h + 5, [w / 2 + 5, w / 2 + 5, 2, 2]); fillOut(x, '#6b3f22', 2);
  rr(x, cx - w / 2, base - h, w, h, [w / 2, w / 2, 1, 1]); fillOut(x, vol(x, cx - w / 2, base - h, cx + w / 2, base, col, 0.18, -0.25), 1.6);
  x.strokeStyle = shade(col, -0.3); x.lineWidth = 1.4; x.beginPath(); x.moveTo(cx, base - h + 4); x.lineTo(cx, base); x.stroke();
  ell(x, cx + w * 0.28, base - h * 0.45, 2.4, 2.4); x.fillStyle = '#f6c445'; x.fill();
  rr(x, cx - w / 2 - 8, base - 3, w + 16, 7, 2); fillOut(x, '#b7bcc0', 1.6);
}

function windowAt(x: Ctx, cx: number, cy: number, w = 32, h = 28, shutter = '#3f8a4a') {
  rr(x, cx - w / 2 - 9, cy - h / 2, 8, h, 2); fillOut(x, vol(x, 0, cy - h / 2, 0, cy + h / 2, shutter), 1.4);
  rr(x, cx + w / 2 + 1, cy - h / 2, 8, h, 2); fillOut(x, vol(x, 0, cy - h / 2, 0, cy + h / 2, shutter), 1.4);
  rr(x, cx - w / 2, cy - h / 2, w, h, 4); fillOut(x, '#fff3d6', 2);
  rr(x, cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6, 2);
  const g = x.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2); g.addColorStop(0, '#d6f1fb'); g.addColorStop(1, '#7fc3e3'); x.fillStyle = g; x.fill();
  x.strokeStyle = '#fff3d6'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(cx, cy - h / 2 + 3); x.lineTo(cx, cy + h / 2 - 3); x.moveTo(cx - w / 2 + 3, cy); x.lineTo(cx + w / 2 - 3, cy); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.moveTo(cx - w / 2 + 5, cy - h / 2 + 5); x.lineTo(cx - w / 2 + 12, cy - h / 2 + 5); x.lineTo(cx - w / 2 + 5, cy + 2); x.closePath(); x.fill();
  // floreira
  rr(x, cx - w / 2 - 4, cy + h / 2 - 1, w + 8, 8, 2); fillOut(x, '#a0673a', 1.6);
  for (let k = 0; k < 4; k++) { const fx = cx - w / 2 + 2 + k * (w / 3.4); ell(x, fx, cy + h / 2 - 3, 3.4, 3.4); fillOut(x, ['#e2574c', '#f6c445', '#f7a6c4', '#ffffff'][k], 1); }
}

function sign(x: Ctx, cx: number, cy: number, item: string | null) {
  x.strokeStyle = '#4a3423'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(cx - 20, cy - 22); x.lineTo(cx + 2, cy - 22); x.moveTo(cx - 10, cy - 22); x.lineTo(cx - 10, cy - 14); x.moveTo(cx + 2, cy - 22); x.lineTo(cx + 2, cy - 14); x.stroke();
  rr(x, cx - 22, cy - 14, 30, 26, 6); fillOut(x, vol(x, cx - 22, cy - 14, cx + 8, cy + 12, '#f3d9a8'), 2);
  if (item && ITEM_BY_ID[item]) drawIcon(x, ITEM_BY_ID[item].icon, 20, cx - 17, cy - 11);
}

function chimney(x: Ctx, cx: number, top: number, h: number) {
  rr(x, cx - 9, top, 18, h, 3); fillOut(x, vol(x, cx - 9, top, cx + 9, top + h, '#b4553b'));
  x.strokeStyle = '#8a3a25'; x.lineWidth = 1.2; for (let yy = top + 8; yy < top + h; yy += 8) { x.beginPath(); x.moveTo(cx - 9, yy); x.lineTo(cx + 9, yy); x.stroke(); }
  rr(x, cx - 12, top - 5, 24, 8, 3); fillOut(x, '#7a3423', 2);
}

/** Frontão (oitão) sobre a porta: triângulo de parede com janela redonda e beirais. */
function gableFront(x: Ctx, cx: number, eaveY: number, ridgeY: number, w: number, wallCol: string, roofCol: string) {
  const h = eaveY - ridgeY;
  x.beginPath(); x.moveTo(cx - w / 2, eaveY); x.lineTo(cx, ridgeY); x.lineTo(cx + w / 2, eaveY); x.closePath();
  fillOut(x, vol(x, cx - w / 2, ridgeY, cx + w / 2, eaveY, wallCol, 0.16, -0.16), 2);
  x.save(); x.clip(); x.strokeStyle = shade(wallCol, -0.14); x.lineWidth = 1.4; for (let yy = ridgeY + 10; yy < eaveY; yy += 10) { x.beginPath(); x.moveTo(cx - w, yy); x.lineTo(cx + w, yy); x.stroke(); } x.restore();
  ell(x, cx, eaveY - h * 0.42, 9, 9); fillOut(x, '#fff3d6', 2); ell(x, cx, eaveY - h * 0.42, 6, 6); x.fillStyle = '#9fd6ee'; x.fill();
  x.strokeStyle = '#fff3d6'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(cx - 6, eaveY - h * 0.42); x.lineTo(cx + 6, eaveY - h * 0.42); x.moveTo(cx, eaveY - h * 0.42 - 6); x.lineTo(cx, eaveY - h * 0.42 + 6); x.stroke();
  for (const sgn of [-1, 1]) {
    x.beginPath(); x.moveTo(cx, ridgeY - 8); x.lineTo(cx + sgn * (w / 2 + 10), eaveY + 4); x.lineTo(cx + sgn * (w / 2 + 2), eaveY + 8); x.lineTo(cx, ridgeY + 2); x.closePath();
    fillOut(x, vol(x, cx - w / 2, ridgeY, cx + w / 2, eaveY, shade(roofCol, -0.12)), 2);
  }
}

/** Telhado visto de cima-frente, entre topY e eaveY (y do beiral). */
function roof(x: Ctx, kind: Spec['roof'], X: number, topY: number, w: number, eaveY: number, col: string, trim?: string) {
  const o = 10; // beiral lateral
  const L = X - o, R = X + w + o, H = eaveY - topY;
  if (kind === 'flat') {
    rr(x, L, topY, R - L, H, 6); fillOut(x, vol(x, L, topY, R, eaveY, col, 0.12, -0.2));
    rr(x, L + 8, topY + 8, R - L - 16, H - 16, 4); x.fillStyle = shade(col, -0.08); x.fill();
    rr(x, L + 16, topY + 14, 30, 18, 3); fillOut(x, vol(x, L + 16, topY + 14, L + 46, topY + 32, '#9aa0a6'), 1.6);
    return;
  }
  if (kind === 'dome') {
    x.beginPath(); x.moveTo(L, eaveY); x.bezierCurveTo(L, topY - 10, R, topY - 10, R, eaveY); x.closePath();
    fillOut(x, sphere(x, (L + R) / 2, topY + H * 0.5, (R - L) * 0.6, col));
    x.strokeStyle = shade(col, -0.2); x.lineWidth = 1.4;
    for (let k = 1; k < 4; k++) { const yy = topY + (H * k) / 4 + 6; x.beginPath(); x.moveTo(L + 6, yy); x.quadraticCurveTo((L + R) / 2, yy - 8, R - 6, yy); x.stroke(); }
    return;
  }
  const ridgeY = topY + (kind === 'shed' ? 0 : H * 0.28);
  // água de trás (estreita, mais clara)
  if (kind !== 'shed') { x.beginPath(); x.moveTo(L + 14, ridgeY); x.lineTo(L + 24, topY); x.lineTo(R - 24, topY); x.lineTo(R - 14, ridgeY); x.closePath(); fillOut(x, vol(x, L, topY, R, ridgeY, shade(col, 0.12))); }
  // água da frente
  x.beginPath();
  if (kind === 'hip') { x.moveTo(L + 26, ridgeY); x.lineTo(R - 26, ridgeY); x.lineTo(R, eaveY); x.lineTo(L, eaveY); }
  else if (kind === 'barn') { x.moveTo(L + 6, ridgeY); x.lineTo(R - 6, ridgeY); x.lineTo(R, ridgeY + (eaveY - ridgeY) * 0.45); x.lineTo(R + 4, eaveY); x.lineTo(L - 4, eaveY); x.lineTo(L, ridgeY + (eaveY - ridgeY) * 0.45); }
  else { x.moveTo(L, ridgeY); x.lineTo(R, ridgeY); x.lineTo(R + 2, eaveY); x.lineTo(L - 2, eaveY); }
  x.closePath();
  const g = x.createLinearGradient(0, ridgeY, 0, eaveY); g.addColorStop(0, shade(col, 0.26)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.26));
  fillOut(x, g);
  // telhas em fileiras onduladas
  x.save(); x.clip();
  x.strokeStyle = shade(col, -0.24); x.lineWidth = 1.6;
  for (let yy = ridgeY + 12, row = 0; yy < eaveY; yy += 12, row++) {
    x.beginPath();
    for (let xx = L - 20 + (row % 2) * 9; xx < R + 20; xx += 18) { x.moveTo(xx, yy); x.quadraticCurveTo(xx + 9, yy + 7, xx + 18, yy); }
    x.stroke();
  }
  const side = x.createLinearGradient(L, 0, R, 0); side.addColorStop(0, 'rgba(255,255,255,.16)'); side.addColorStop(0.3, 'rgba(255,255,255,0)'); side.addColorStop(0.75, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(30,15,5,.22)');
  x.fillStyle = side; x.fillRect(L - 10, ridgeY, R - L + 20, eaveY - ridgeY);
  x.restore();
  if (kind === 'barn') { x.strokeStyle = trim ?? '#fffdf6'; x.lineWidth = 4; x.beginPath(); x.moveTo(L + 6, ridgeY + 2); x.lineTo(R - 6, ridgeY + 2); x.stroke(); }
  // cumeeira
  if (kind !== 'shed') { rr(x, L + 18, ridgeY - 4, R - L - 36, 8, 4); fillOut(x, shade(col, -0.28), 1.8); }
  // borda do beiral
  rr(x, L - 2, eaveY - 4, R - L + 4, 8, 3); fillOut(x, shade(col, -0.32), 1.8);
}

// ---------------------------------------------------------------- prédios especiais
function special(id: string, x: Ctx, W: number, FH: number, top: number, b: BuildingDef, A: (k: string, p: [number, number]) => void) {
  const base = top + FH;
  const L = ML, R = ML + W;
  switch (id) {
    case 'well': {
      const cx = (L + R) / 2;
      shadow(x, cx + 8, base - 10, W * 0.5, 16);
      ell(x, cx, base - 22, W * 0.4, 16); fillOut(x, '#8d939a');
      rr(x, cx - W * 0.4, base - 58, W * 0.8, 36, 10); fillOut(x, vol(x, cx - W * 0.4, base - 58, cx + W * 0.4, base - 22, '#a7adb2'));
      const r = mulberry(5); for (let i = 0; i < 9; i++) { ell(x, cx - W * 0.34 + r() * W * 0.68, base - 52 + r() * 26, 7, 5); x.strokeStyle = '#7a8086'; x.lineWidth = 1.2; x.stroke(); }
      ell(x, cx, base - 58, W * 0.4, 12); fillOut(x, '#8d939a'); ell(x, cx, base - 58, W * 0.32, 8); x.fillStyle = '#2f5f7a'; x.fill(); shine(x, cx - 8, base - 60, 8, 2, 0.5);
      for (const px of [cx - W * 0.36, cx + W * 0.36]) { rr(x, px - 4, base - 126, 8, 70, 3); fillOut(x, vol(x, px - 4, 0, px + 4, 0, '#8d5a33'), 1.8); }
      x.beginPath(); x.moveTo(cx - W * 0.5, base - 110); x.lineTo(cx, base - 146); x.lineTo(cx + W * 0.5, base - 110); x.closePath(); fillOut(x, vol(x, cx - W * 0.5, base - 146, cx + W * 0.5, base - 110, b.roof));
      x.strokeStyle = '#4a3423'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, base - 112); x.lineTo(cx, base - 76); x.stroke();
      rr(x, cx - 9, base - 80, 18, 16, 3); fillOut(x, '#a0673a', 1.6);
      A('top', [cx, base - 150]);
      return true;
    }
    case 'workbench': {
      shadow(x, (L + R) / 2 + 8, base - 6, W * 0.5, 14);
      for (const px of [L + 14, R - 22]) { rr(x, px, base - 52, 8, 50, 2); fillOut(x, vol(x, px, 0, px + 8, 0, '#8d6e44'), 1.8); }
      rr(x, L + 4, base - 74, W - 8, 30, 6); fillOut(x, vol(x, L, base - 74, R, base - 44, '#d4a46a'));
      x.strokeStyle = '#a77a45'; x.lineWidth = 1.4; for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo(L + 6, base - 74 + k * 7); x.lineTo(R - 6, base - 74 + k * 7); x.stroke(); }
      x.save(); x.translate(L + W * 0.3, base - 80); x.rotate(-0.6); rr(x, -3, -30, 6, 34, 2); fillOut(x, '#8d5a33', 1.6); rr(x, -11, -36, 22, 11, 3); fillOut(x, vol(x, -11, -36, 11, -25, '#b7bcc0'), 1.6); x.restore();
      drawIcon(x, ITEM_BY_ID.rope.icon, 34, L + W * 0.55, base - 104);
      rr(x, R - 60, base - 44, 40, 38, 4); fillOut(x, vol(x, R - 60, base - 44, R - 20, base - 6, '#b9824e'));
      x.strokeStyle = '#8d5a33'; x.lineWidth = 2; x.beginPath(); x.moveTo(R - 60, base - 25); x.lineTo(R - 20, base - 25); x.stroke();
      A('top', [(L + R) / 2, base - 110]);
      return true;
    }
    case 'sales_cart': case 'market': {
      const cart = id === 'sales_cart';
      shadow(x, (L + R) / 2 + 10, base - 8, W * 0.52, 14);
      rr(x, L + 8, base - 70, W - 16, 46, 8); fillOut(x, vol(x, L, base - 70, R, base - 24, '#d4a46a'));
      x.strokeStyle = '#a77a45'; x.lineWidth = 1.6; for (let k = 1; k < 3; k++) { x.beginPath(); x.moveTo(L + 10, base - 70 + k * 15); x.lineTo(R - 10, base - 70 + k * 15); x.stroke(); }
      if (cart) for (const px of [L + 34, R - 34]) { ell(x, px, base - 20, 18, 18); fillOut(x, vol(x, px - 18, base - 38, px + 18, base - 2, '#8d5a33')); ell(x, px, base - 20, 5, 5); x.fillStyle = OUT; x.fill(); for (let k = 0; k < 6; k++) { x.strokeStyle = '#6b3f22'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, base - 20); x.lineTo(px + Math.cos(k) * 15, base - 20 + Math.sin(k) * 15); x.stroke(); } }
      const items = cart ? ['carrot', 'apple', 'wheat'] : ['bread', 'jam', 'basket'];
      items.forEach((it, k) => { const ix = L + 18 + k * ((W - 36) / 3); rr(x, ix, base - 86, (W - 36) / 3 - 6, 20, 4); fillOut(x, '#b9824e', 1.6); drawIcon(x, ITEM_BY_ID[it].icon, 30, ix + ((W - 36) / 3 - 36) / 2, base - 108); });
      for (const px of [L + 12, R - 18]) { rr(x, px, base - 156, 6, 90, 2); fillOut(x, '#8d6e44', 1.6); }
      // toldo listrado com borda ondulada
      const ay = base - 162, ah = 40;
      x.beginPath(); x.moveTo(L - 4, ay); x.lineTo(R + 4, ay); x.lineTo(R + 8, ay + ah);
      for (let xx = R + 8; xx >= L - 8; xx -= (W + 16) / 8) x.quadraticCurveTo(xx - (W + 16) / 16, ay + ah + 12, xx - (W + 16) / 8, ay + ah);
      x.closePath(); fillOut(x, '#fffdf6');
      x.save(); x.clip(); for (let k = 0; k < 8; k++) { if (k % 2) continue; x.fillStyle = cart ? '#4a86c4' : b.roof; x.fillRect(L - 8 + (k * (W + 16)) / 8, ay, (W + 16) / 8, ah + 14); } x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(L - 8, ay + ah - 8, W + 16, 22); x.restore();
      if (cart) drawIcon(x, { s: 'coin', c: '#f6c445' }, 30, R - 46, base - 64);
      A('top', [(L + R) / 2, ay - 6]);
      return true;
    }
    case 'order_board': {
      shadow(x, (L + R) / 2 + 8, base - 6, W * 0.48, 12);
      for (const px of [L + 12, R - 20]) { rr(x, px, base - 118, 8, 116, 3); fillOut(x, vol(x, px, 0, px + 8, 0, '#8d5a33'), 1.8); }
      rr(x, L + 2, base - 130, W - 4, 76, 8); fillOut(x, vol(x, L, base - 130, R, base - 54, '#a0673a'));
      rr(x, L + 9, base - 123, W - 18, 62, 5); fillOut(x, '#c99a5b', 1.6);
      x.beginPath(); x.moveTo(L - 4, base - 130); x.lineTo((L + R) / 2, base - 150); x.lineTo(R + 4, base - 130); x.closePath(); fillOut(x, vol(x, L, base - 150, R, base - 130, b.roof));
      for (const [px, py, r] of [[L + 16, base - 118, -0.08], [L + W / 2 - 2, base - 114, 0.06], [L + 22, base - 90, 0.04], [L + W / 2 + 4, base - 88, -0.05]] as const) {
        x.save(); x.translate(px, py); x.rotate(r); rr(x, 0, 0, 22, 24, 2); fillOut(x, '#fffdf6', 1.4); x.fillStyle = '#b7bcc0'; for (let k = 0; k < 3; k++) x.fillRect(4, 7 + k * 5, 14, 2); x.restore();
        ell(x, px + 11, py + 2, 2.6, 2.6); x.fillStyle = '#e2574c'; x.fill();
      }
      A('top', [(L + R) / 2, base - 154]);
      return true;
    }
    case 'apiary': {
      shadow(x, (L + R) / 2 + 8, base - 8, W * 0.5, 14);
      for (const [px, py] of [[L + W * 0.26, base - 64], [L + W * 0.74, base - 64], [L + W * 0.5, base - 6]] as const) {
        for (let k = 0; k < 3; k++) { rr(x, px - 26, py - 22 - k * 18, 52, 20, 4); fillOut(x, vol(x, px - 26, py - 22 - k * 18, px + 26, py - 2 - k * 18, k % 2 ? '#ffca3a' : '#f6b02a'), 1.8); }
        rr(x, px - 30, py - 80, 60, 12, 4); fillOut(x, vol(x, px - 30, py - 80, px + 30, py - 68, '#8d5a33'), 1.8);
        rr(x, px - 8, py - 12, 16, 5, 2); x.fillStyle = OUT; x.fill();
      }
      A('top', [(L + R) / 2, base - 160]);
      return true;
    }
    case 'greenhouse': {
      const wallTop = base - 70;
      shadow(x, (L + R) / 2 + 10, base - 6, W * 0.55, 14);
      rr(x, L + 4, wallTop, W - 8, 66, 4); fillOut(x, 'rgba(200,238,250,.75)');
      for (let k = 0; k < 6; k++) { const px = L + 20 + k * ((W - 40) / 5); ell(x, px, base - 26, 13, 11); fillOut(x, sphere(x, px, base - 26, 13, '#5fa046'), 1.4); ell(x, px - 3, base - 30, 3.4, 3.4); x.fillStyle = '#e2574c'; x.fill(); }
      x.beginPath(); x.moveTo(L - 2, wallTop); x.bezierCurveTo(L + 10, top - 60, R - 10, top - 60, R + 2, wallTop); x.closePath(); fillOut(x, 'rgba(180,228,246,.82)');
      x.strokeStyle = '#4f7a8c'; x.lineWidth = 2.4;
      for (let k = 0; k <= 5; k++) { const px = L + 4 + k * ((W - 8) / 5); x.beginPath(); x.moveTo(px, base - 4); x.lineTo(px, wallTop); x.quadraticCurveTo((px + (L + R) / 2) / 2, top - 30, (L + R) / 2, top - 44); x.stroke(); }
      x.beginPath(); x.moveTo(L + 4, wallTop); x.lineTo(R - 4, wallTop); x.stroke();
      shine(x, L + W * 0.3, top - 20, 30, 10, 0.4, -0.2);
      A('top', [(L + R) / 2, top - 50]);
      return true;
    }
  }
  return false;
}

/** Arte de um prédio. Origem = canto superior-esquerdo do lote (em px 2x do canvas). */
export function buildingArt(b: BuildingDef): BuildingArt {
  const W = b.spot.w * T, FH = b.spot.h * T;
  const spec = SPECS[b.id] ?? { roof: 'gable', mat: 'plank', rise: 56 };
  const top = (b.id === 'mill' ? 190 : spec.rise + 70);
  const { c, x } = cv(ML + W + MR, top + FH + MB);
  const anchors: Record<string, [number, number]> = {};
  const A = (k: string, p: [number, number]) => { anchors[k] = [(p[0] - ML) / 2, (p[1] - top) / 2]; };
  const product = RECIPES.find((r) => r.b === b.id)?.id ?? null;
  const base = top + FH;

  if (!special(b.id, x, W, FH, top, b, A)) {
    const L = ML, R = ML + W;
    // sombra projetada para baixo-direita
    shadow(x, (L + R) / 2 + 16, base - 4, W * 0.56, 18, 0.3);
    if (b.id === 'mill') {
      const tw = W * 0.7, tl = (L + R) / 2 - tw / 2, wallTop = base - 150;
      wall(x, tl, wallTop, tw, 150, b.wall, 'stone');
      door(x, (L + R) / 2, base - 8, 30, 46, shade(b.roof, -0.3));
      windowAt(x, (L + R) / 2, wallTop + 40, 22, 22);
      roof(x, 'hip', tl, wallTop - 70, tw, wallTop + 8, b.roof);
      A('hub', [(L + R) / 2, wallTop - 20]);
      A('top', [(L + R) / 2, wallTop - 80]);
    } else {
      const wallH = Math.min(FH * 0.62, 26 + 34 * Math.min(b.spot.h, 3));
      const wallTop = base - wallH;
      wall(x, L, wallTop, W, wallH, b.wall, spec.mat);
      const dx = L + (Math.floor(b.spot.w / 2) + 0.5) * T;
      if (spec.roof === 'barn') {
        const dw = Math.min(70, W * 0.32), dh = wallH * 0.78;
        rr(x, dx - dw / 2, base - dh - 8, dw, dh, 4); fillOut(x, vol(x, dx - dw / 2, base - dh, dx + dw / 2, base, shade(b.roof, -0.1)));
        x.strokeStyle = '#fffdf6'; x.lineWidth = 4; x.strokeRect(dx - dw / 2 + 4, base - dh - 4, dw - 8, dh - 8);
        x.beginPath(); x.moveTo(dx - dw / 2 + 4, base - dh - 4); x.lineTo(dx + dw / 2 - 4, base - 12); x.moveTo(dx + dw / 2 - 4, base - dh - 4); x.lineTo(dx - dw / 2 + 4, base - 12); x.stroke();
      } else door(x, dx, base - 8, 36, Math.min(56, wallH * 0.74), shade(b.roof, -0.32));
      // janelas distribuídas fugindo da porta
      for (let wx = L + 40; wx < R - 30; wx += 74) if (Math.abs(wx - dx) > 46) windowAt(x, wx, wallTop + wallH * 0.42);
      if (spec.chimney) chimney(x, L + W * 0.74, top - spec.rise + 6, 54);
      roof(x, spec.roof, L, top - spec.rise + 24, W, wallTop + 8, b.roof);
      if (spec.chimney) { x.save(); x.beginPath(); x.rect(0, 0, c.width, top - spec.rise + 40); x.clip(); chimney(x, L + W * 0.74, top - spec.rise + 6, 54); x.restore(); A('smoke', [L + W * 0.74, top - spec.rise]); }
      if (spec.roof === 'gable' && b.spot.w >= 3) { const rY = top - spec.rise + 24 + (wallTop + 8 - (top - spec.rise + 24)) * 0.28; gableFront(x, dx, wallTop + 6, rY + 4, Math.min(W * 0.5, 120), b.wall, b.roof); if (spec.chimney) { x.save(); x.beginPath(); x.rect(0, 0, c.width, top - spec.rise + 40); x.clip(); chimney(x, L + W * 0.74, top - spec.rise + 6, 54); x.restore(); } }
      if (product) sign(x, dx - 34, wallTop + 30, product);
      // detalhes de cada prédio
      if (b.id === 'farmhouse') { rr(x, L + 16, base - 12, W - 32, 10, 3); fillOut(x, '#a0673a', 1.8); for (let k = 0; k < 7; k++) { rr(x, L + 20 + k * ((W - 44) / 6), base - 34, 5, 24, 2); fillOut(x, '#c99a5b', 1.2); } x.beginPath(); x.moveTo(L + 16, base - 34); x.lineTo(R - 16, base - 34); x.lineWidth = 3; x.strokeStyle = '#8d5a33'; x.stroke(); }
      if (b.id === 'sawmill') { for (let k = 0; k < 3; k++) { rr(x, R - 8, base - 22 - k * 16, 46, 16, 8); fillOut(x, vol(x, R - 8, 0, R + 38, 0, '#a0673a'), 1.6); ell(x, R + 38, base - 14 - k * 16, 6, 8); fillOut(x, '#e2b27a', 1.4); } ell(x, L + 30, wallTop + 30, 16, 16); fillOut(x, sphere(x, L + 30, wallTop + 30, 16, '#cfd6db'), 1.8); }
      if (b.id === 'barn' || b.id === 'warehouse') { rr(x, R - 4, base - 30, 34, 28, 6); fillOut(x, vol(x, R - 4, base - 30, R + 30, base - 2, '#e6c35a'), 1.8); x.strokeStyle = '#c9a43a'; x.lineWidth = 1.4; for (let k = 1; k < 3; k++) { x.beginPath(); x.moveTo(R - 2, base - 30 + k * 9); x.lineTo(R + 28, base - 30 + k * 9); x.stroke(); } }
      if (b.id === 'smithy') { rr(x, R - 4, base - 26, 30, 12, 3); fillOut(x, vol(x, 0, base - 26, 0, base - 14, '#5d666c'), 1.8); rr(x, R + 4, base - 14, 14, 12, 2); fillOut(x, '#4a4f54', 1.6); }
      if (b.id === 'pottery' || b.id === 'florist') for (let k = 0; k < 3; k++) { const px = R + 4 + (k % 2) * 14, py = base - 6 - k * 4; x.beginPath(); x.moveTo(px - 8, py - 18); x.lineTo(px + 8, py - 18); x.lineTo(px + 6, py); x.lineTo(px - 6, py); x.closePath(); fillOut(x, vol(x, px - 8, py - 18, px + 8, py, '#c97b4a'), 1.6); if (b.id === 'florist') { ell(x, px, py - 22, 7, 6); fillOut(x, ['#e2574c', '#f7a6c4', '#f6c445'][k], 1.2); } }
      if (b.id === 'oil_press' || b.id === 'kitchen') for (let k = 0; k < 2; k++) { rr(x, R - 2 + k * 18, base - 30, 16, 26, 6); fillOut(x, vol(x, 0, base - 30, 0, base - 4, '#a0673a'), 1.6); x.strokeStyle = '#5d666c'; x.lineWidth = 2; x.beginPath(); x.moveTo(R - 2 + k * 18, base - 22); x.lineTo(R + 14 + k * 18, base - 22); x.stroke(); }
      if (b.id === 'jewelry') { x.strokeStyle = '#f6c445'; x.lineWidth = 3; x.strokeRect(L + 3, wallTop + 3, W - 6, wallH - 6); }
      if (b.id === 'great_workshop') { ell(x, (L + R) / 2, top - spec.rise + 50, 20, 20); fillOut(x, sphere(x, (L + R) / 2, top - spec.rise + 50, 20, '#cfd6db')); ell(x, (L + R) / 2, top - spec.rise + 50, 7, 7); x.fillStyle = '#5d666c'; x.fill(); }
      A('top', [(L + R) / 2, top - spec.rise + 20]);
    }
  }
  return { c, ox: ML / c.width, oy: top / c.height, anchors };
}

/** Obra em andamento: fundação, andaimes, tábuas e materiais no lote. */
export function constructionArt(w: number, h: number): BuildingArt {
  const W = w * T, FH = h * T, top = 110;
  const { c, x } = cv(ML + W + MR, top + FH + MB);
  const L = ML, R = ML + W, base = top + FH;
  shadow(x, (L + R) / 2 + 12, base - 4, W * 0.55, 16, 0.22);
  rr(x, L, base - FH * 0.5, W, FH * 0.5 - 2, 6); fillOut(x, vol(x, L, base - FH * 0.5, R, base, '#c9a46e'), 1.8);
  rr(x, L + 6, base - 34, W - 12, 26, 4); fillOut(x, vol(x, L, base - 34, R, base - 8, '#d9b27a'), 1.6);
  const tY = base - FH * 0.5 - 70;
  x.strokeStyle = '#8d5a33'; x.lineWidth = 6;
  for (let px = L + 8; px <= R - 8; px += (W - 16) / Math.max(2, w)) { x.beginPath(); x.moveTo(px, base - 10); x.lineTo(px, tY); x.stroke(); }
  x.lineWidth = 5; for (const yy of [tY + 10, tY + 50, base - 50]) { x.beginPath(); x.moveTo(L + 2, yy); x.lineTo(R - 2, yy); x.stroke(); }
  x.lineWidth = 3; x.strokeStyle = '#a0673a'; x.beginPath(); x.moveTo(L + 8, base - 50); x.lineTo(R - 8, tY + 10); x.stroke();
  for (let k = 0; k < 3; k++) { rr(x, L + 16 + k * 6, base - 20 - k * 8, 60, 9, 3); fillOut(x, vol(x, 0, 0, 0, 9, '#e2b27a'), 1.4); }
  rr(x, R - 52, base - 46, 40, 36, 4); fillOut(x, vol(x, R - 52, base - 46, R - 12, base - 10, '#b9824e'));
  x.strokeStyle = '#8d5a33'; x.lineWidth = 2; x.beginPath(); x.moveTo(R - 52, base - 46); x.lineTo(R - 12, base - 10); x.moveTo(R - 12, base - 46); x.lineTo(R - 52, base - 10); x.stroke();
  // fita de obra
  x.lineWidth = 6; x.strokeStyle = '#f6c445'; x.setLineDash([12, 10]); x.beginPath(); x.moveTo(L - 4, base - 2); x.lineTo(R + 4, base - 2); x.stroke(); x.setLineDash([]);
  return { c, ox: ML / c.width, oy: top / c.height, anchors: { top: [(W) / 4, (tY - top) / 2 - 10] } };
}

/** Lote livre: área tracejada na grade e placa com "+". */
export function lotArt(w: number, h: number): BuildingArt {
  const W = w * T, FH = h * T, top = 40;
  const { c, x } = cv(ML + W + MR, top + FH + MB);
  const L = ML, base = top + FH;
  rr(x, L + 4, top + 4, W - 8, FH - 8, 14); x.fillStyle = 'rgba(255,253,246,.16)'; x.fill();
  x.setLineDash([12, 9]); x.lineWidth = 3.4; x.strokeStyle = 'rgba(74,52,35,.55)'; x.stroke(); x.setLineDash([]);
  const cx = L + W / 2;
  rr(x, cx - 3, base - FH / 2 - 10, 6, 40, 2); fillOut(x, '#8d5a33', 1.6);
  rr(x, cx - 26, base - FH / 2 - 40, 52, 34, 8); fillOut(x, vol(x, cx - 26, 0, cx + 26, 0, '#f3d9a8'), 2.2);
  x.strokeStyle = '#3f8a4a'; x.lineWidth = 5; x.beginPath(); x.moveTo(cx - 9, base - FH / 2 - 23); x.lineTo(cx + 9, base - FH / 2 - 23); x.moveTo(cx, base - FH / 2 - 32); x.lineTo(cx, base - FH / 2 - 14); x.stroke();
  return { c, ox: ML / c.width, oy: top / c.height, anchors: { top: [W / 4, -FH / 4] } };
}

/** Todas as artes (prancha de QA). */
export async function allBuildingArts() {
  const out: Record<string, BuildingArt> = {};
  for (const b of BUILDINGS) out[b.id] = buildingArt(b);
  out.obra_3x2 = constructionArt(3, 2); out.obra_4x3 = constructionArt(4, 3); out.lote_4x3 = lotArt(4, 3);
  return out;
}
