// Arte isométrica procedural: terreno-ilha, prédios em volume, canteiros e obras.
// Prédios são modelados como caixas 3D simples projetadas em 2:1 e desenhados a 2x.
import {
  REGIONS, PATH_TILES, RIVER, BRIDGES, MAP_W, MAP_H, FIELD, CROPS, RECIPES, buildingTiles, regionAt, isWater,
  type BuildingDef,
} from '../../data/catalog.ts';
import { ITEM_BY_ID } from '../../data/items.ts';
import { canvas, ellipse, fs, mulberry, rrect, shade, INK } from './draw.ts';
import { drawIcon } from './icons.ts';
import { isoTile, WORLD_W, WORLD_H, TW, TH } from '../iso.ts';

type Ctx = CanvasRenderingContext2D;
type V3 = [number, number, number];

// ---------------------------------------------------------------- projeção local (1x)
const P = (x: number, y: number, z: number): [number, number] => [(x - y) * (TW / 2), (x + y) * (TH / 2) - z];

function face(x: Ctx, pts: V3[], fill: string, lw = 1.6, stroke = INK) {
  x.beginPath();
  pts.forEach((p, i) => { const [a, b] = P(...p); if (i) x.lineTo(a, b); else x.moveTo(a, b); });
  x.closePath();
  fs(x, fill, lw, stroke);
}

/** Caixa com as três faces visíveis (sul = esquerda-frente, leste = direita-frente, topo). */
function box(x: Ctx, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, col: string, top?: string, lw = 1.6) {
  face(x, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col, lw);
  face(x, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], shade(col, -0.22), lw);
  face(x, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top ?? shade(col, 0.14), lw);
}

/** Retângulo numa face: 'S' (plano y=y) ou 'E' (plano x=x). u = posição ao longo da face. */
function onFace(x: Ctx, side: 'S' | 'E', plane: number, u0: number, u1: number, z0: number, z1: number, fill: string, lw = 1.3) {
  const pts: V3[] = side === 'S'
    ? [[u0, plane, z0], [u1, plane, z0], [u1, plane, z1], [u0, plane, z1]]
    : [[plane, u0, z0], [plane, u1, z0], [plane, u1, z1], [plane, u0, z1]];
  face(x, pts, fill, lw);
}

function windowOn(x: Ctx, side: 'S' | 'E', plane: number, u: number, z: number, w = 0.42, h = 14, frame = '#7a4f2a') {
  onFace(x, side, plane, u - w / 2 - 0.04, u + w / 2 + 0.04, z - 2, z + h + 2, frame, 1.2);
  onFace(x, side, plane, u - w / 2, u + w / 2, z, z + h, side === 'S' ? '#bfe3f2' : '#9fc9dc', 1);
  // cruz do caixilho
  const [a1, b1] = side === 'S' ? P(u, plane, z) : P(plane, u, z);
  const [a2, b2] = side === 'S' ? P(u, plane, z + h) : P(plane, u, z + h);
  x.strokeStyle = frame; x.lineWidth = 1.2; x.beginPath(); x.moveTo(a1, b1); x.lineTo(a2, b2); x.stroke();
  // floreira
  onFace(x, side, plane, u - w / 2 - 0.06, u + w / 2 + 0.06, z - 6, z - 2, '#8d5a33', 1);
  for (let k = 0; k < 3; k++) {
    const t = u - w / 2 + (k + 0.5) * (w / 3);
    const [fx, fy] = side === 'S' ? P(t, plane, z - 2) : P(plane, t, z - 2);
    ellipse(x, fx, fy - 1, 2.6, 2.4); fs(x, ['#e91e63', '#ffd54f', '#ff7043'][k], 0.8);
  }
}

function door(x: Ctx, side: 'S' | 'E', plane: number, u: number, h: number, col: string, w = 0.5) {
  onFace(x, side, plane, u - w / 2 - 0.05, u + w / 2 + 0.05, 0, h + 3, shade(col, 0.25), 1.2);
  onFace(x, side, plane, u - w / 2, u + w / 2, 0, h, col, 1.2);
  const [kx, ky] = side === 'S' ? P(u + w * 0.3, plane, h * 0.45) : P(plane, u + w * 0.3, h * 0.45);
  ellipse(x, kx, ky, 1.6, 1.6); x.fillStyle = '#f2c230'; x.fill();
}

/** Telhado de duas águas. axis 'x' = cumeeira paralela ao eixo x. */
function gable(x: Ctx, x0: number, y0: number, x1: number, y1: number, zw: number, zr: number, col: string, axis: 'x' | 'y', e = 0.18, trim?: string) {
  const X0 = x0 - e, X1 = x1 + e, Y0 = y0 - e, Y1 = y1 + e;
  if (axis === 'x') {
    const ym = (y0 + y1) / 2;
    face(x, [[X0, Y0, zw], [X1, Y0, zw], [X1, ym, zr], [X0, ym, zr]], shade(col, 0.12));
    face(x, [[x1, y0, zw], [x1, y1, zw], [x1, ym, zr]], shade(col, -0.45), 1.4); // oitão (leste)
    face(x, [[X0, Y1, zw], [X1, Y1, zw], [X1, ym, zr], [X0, ym, zr]], col);
    shingles(x, [X0, Y1, zw], [X1, Y1, zw], [X1, ym, zr], [X0, ym, zr], shade(col, -0.18));
  } else {
    const xm = (x0 + x1) / 2;
    face(x, [[X0, Y0, zw], [X0, Y1, zw], [xm, Y1, zr], [xm, Y0, zr]], shade(col, 0.12));
    face(x, [[X1, Y0, zw], [X1, Y1, zw], [xm, Y1, zr], [xm, Y0, zr]], shade(col, -0.16));
    shingles(x, [X1, Y0, zw], [X1, Y1, zw], [xm, Y1, zr], [xm, Y0, zr], shade(col, -0.32));
    face(x, [[x0, y1, zw], [x1, y1, zw], [xm, y1, zr]], shade(col, -0.05), 1.4); // oitão (sul)
  }
  if (trim) {
    x.strokeStyle = trim; x.lineWidth = 2.4;
    const a = axis === 'x' ? [P(X0, (y0 + y1) / 2, zr), P(X1, (y0 + y1) / 2, zr)] : [P((x0 + x1) / 2, Y0, zr), P((x0 + x1) / 2, Y1, zr)];
    x.beginPath(); x.moveTo(...a[0]); x.lineTo(...a[1]); x.stroke();
  }
}

function shingles(x: Ctx, a: V3, b: V3, c: V3, d: V3, col: string) {
  x.strokeStyle = col; x.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const p = a.map((v, k) => v + (d[k] - v) * t) as V3, q = b.map((v, k) => v + (c[k] - v) * t) as V3;
    x.beginPath(); x.moveTo(...P(...p)); x.lineTo(...P(...q)); x.stroke();
  }
}

function pyramid(x: Ctx, x0: number, y0: number, x1: number, y1: number, zw: number, zr: number, col: string, e = 0.15) {
  const X0 = x0 - e, X1 = x1 + e, Y0 = y0 - e, Y1 = y1 + e, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  face(x, [[X0, Y0, zw], [X1, Y0, zw], [cx, cy, zr]], shade(col, 0.15));
  face(x, [[X0, Y0, zw], [X0, Y1, zw], [cx, cy, zr]], shade(col, 0.08));
  face(x, [[X1, Y0, zw], [X1, Y1, zw], [cx, cy, zr]], shade(col, -0.2));
  face(x, [[X0, Y1, zw], [X1, Y1, zw], [cx, cy, zr]], col);
}

function chimney(x: Ctx, cx: number, cy: number, z0: number, z1: number) {
  box(x, cx - 0.16, cy - 0.16, cx + 0.16, cy + 0.16, z0, z1, '#9c4a33');
  box(x, cx - 0.2, cy - 0.2, cx + 0.2, cy + 0.2, z1, z1 + 4, '#6d2a1a');
}

function groundShadow(x: Ctx, w: number, h: number) {
  x.beginPath();
  const pts: V3[] = [[-0.25, -0.1, 0], [w + 0.35, -0.1, 0], [w + 0.35, h + 0.35, 0], [-0.25, h + 0.35, 0]];
  pts.forEach((p, i) => { const [a, b] = P(...p); if (i) x.lineTo(a, b); else x.moveTo(a, b); });
  x.closePath(); x.fillStyle = 'rgba(30,45,20,.25)'; x.fill();
}

function plaque(x: Ctx, sx: number, sy: number, item: string | null, s = 1) {
  rrect(x, sx - 13 * s, sy - 11 * s, 26 * s, 22 * s, 5 * s); fs(x, '#f7f8f4', 2 * s, '#1d3b72');
  if (item && ITEM_BY_ID[item]) drawIcon(x, ITEM_BY_ID[item].icon, 18 * s, sx - 9 * s, sy - 9 * s);
}

export interface IsoArt { c: HTMLCanvasElement; ox: number; oy: number; anchors: Record<string, [number, number]> }

/** Cria o canvas (2x) com a origem local (0,0,0) mapeada; anchors em px de tela 1x relativos à origem. */
function art(w: number, h: number, topH: number, draw: (x: Ctx, anchor: (k: string, p: [number, number]) => void) => void): IsoArt {
  const pad = 14;
  const minX = -(TW / 2) * h - pad, maxX = (TW / 2) * w + pad, minY = -topH - pad, maxY = (TH / 2) * (w + h) + pad;
  const { c, ctx } = canvas(Math.ceil((maxX - minX) * 2), Math.ceil((maxY - minY) * 2));
  ctx.scale(2, 2); ctx.translate(-minX, -minY);
  const anchors: Record<string, [number, number]> = {};
  draw(ctx, (k, p) => { anchors[k] = p; });
  return { c, ox: -minX * 2, oy: -minY * 2, anchors };
}

// ---------------------------------------------------------------- prédios
const STYLE: Record<string, 'gable' | 'barn' | 'flat' | 'dome' | 'pyramid' | 'special'> = {
  farmhouse: 'gable', barn: 'barn', warehouse: 'barn', great_workshop: 'barn', sawmill: 'gable', bakery: 'gable',
  carpentry: 'gable', kitchen: 'gable', weaving: 'gable', toolshed: 'gable', florist: 'gable',
  pottery: 'dome', foundry: 'dome', glassworks: 'flat', oil_press: 'flat', smithy: 'flat', jewelry: 'pyramid',
};
const CHIMNEYS = new Set(['farmhouse', 'bakery', 'kitchen', 'pottery', 'foundry', 'glassworks', 'smithy', 'jewelry']);

export function isoBuildingArt(b: BuildingDef): IsoArt {
  const w = b.spot.w, h = b.spot.h, m = Math.min(w, h);
  const wallH = 26 + 8 * m, roofH = 18 + 7 * m;
  const product = RECIPES.find((r) => r.b === b.id)?.id ?? null;
  const i0 = 0.1, X0 = i0, Y0 = i0, X1 = w - i0, Y1 = h - i0;
  const top = wallH + roofH + 70;

  return art(w, h, top, (x, anchor) => {
    groundShadow(x, w, h);
    anchor('top', P(w / 2, h / 2, wallH + roofH));
    switch (b.id) {
      case 'well': {
        const cx = w / 2, cy = h / 2;
        const [sx, sy] = P(cx, cy, 0);
        ellipse(x, sx, sy, 30, 15); fs(x, '#8d939a', 1.8);
        ellipse(x, sx, sy - 18, 30, 15); fs(x, '#9aa0a6', 1.8);
        x.fillStyle = '#9aa0a6'; x.fillRect(sx - 30, sy - 18, 60, 18);
        x.strokeStyle = INK; x.lineWidth = 1.8; x.beginPath(); x.moveTo(sx - 30, sy - 18); x.lineTo(sx - 30, sy); x.moveTo(sx + 30, sy - 18); x.lineTo(sx + 30, sy); x.stroke();
        x.beginPath(); x.ellipse(sx, sy, 30, 15, 0, 0, Math.PI); x.stroke();
        ellipse(x, sx, sy - 18, 22, 10); fs(x, '#2f5f7a', 1.6);
        for (const [px, py] of [[cx - 0.55, cy + 0.1], [cx + 0.1, cy - 0.55]] as const) box(x, px - 0.07, py - 0.07, px + 0.07, py + 0.07, 18, 64, '#8d5a33');
        pyramid(x, cx - 0.75, cy - 0.75, cx + 0.75, cy + 0.75, 62, 86, b.roof, 0.05);
        const [bx, by] = P(cx, cy, 44); rrect(x, bx - 5, by - 4, 10, 10, 2); fs(x, '#a0673a', 1.4);
        break;
      }
      case 'workbench': {
        for (const [px, py] of [[0.4, 0.5], [w - 0.4, 0.5], [0.4, h - 0.5], [w - 0.4, h - 0.5]]) box(x, px - 0.08, py - 0.08, px + 0.08, py + 0.08, 0, 20, '#8d6e44');
        box(x, 0.2, 0.25, w - 0.2, h - 0.25, 20, 27, '#c99a5b');
        const [tx, ty] = P(w * 0.35, h * 0.45, 27); x.save(); x.translate(tx, ty); x.rotate(-0.5); rrect(x, -2, -20, 4, 22, 1); fs(x, '#8d5a33', 1.3); rrect(x, -7, -24, 14, 7, 2); fs(x, '#9ea7ad', 1.3); x.restore();
        const [rx, ry] = P(w * 0.65, h * 0.5, 27); drawIcon(x, ITEM_BY_ID.rope.icon, 22, rx - 11, ry - 18);
        box(x, w - 0.9, h - 0.6, w - 0.2, h - 0.05, 0, 18, '#a0673a');
        break;
      }
      case 'sales_cart': {
        box(x, 0.3, 0.35, w - 0.3, h - 0.35, 12, 34, '#d9a766');
        for (const u of [0.7, w - 0.7]) { const [wx, wy] = P(u, h - 0.35, 12); ellipse(x, wx, wy, 11, 12, -0.45); fs(x, '#8d5a33', 1.8); ellipse(x, wx, wy, 3, 3); x.fillStyle = INK; x.fill(); }
        for (const [px, py] of [[0.35, 0.4], [w - 0.35, 0.4]]) box(x, px - 0.05, py - 0.05, px + 0.05, py + 0.05, 34, 70, '#8d6e44');
        face(x, [[0.15, 0.2, 72], [w - 0.15, 0.2, 72], [w - 0.15, h - 0.1, 58], [0.15, h - 0.1, 58]], '#f7f8f4');
        for (let k = 0; k < 6; k += 2) { const a = 0.15 + (k * (w - 0.3)) / 6, c = 0.15 + ((k + 1) * (w - 0.3)) / 6; face(x, [[a, 0.2, 72], [c, 0.2, 72], [c, h - 0.1, 58], [a, h - 0.1, 58]], '#2f6db5', 1); }
        ['carrot', 'apple', 'wheat'].forEach((it, k) => { const [ix, iy] = P(0.8 + k * 0.7, h / 2, 34); drawIcon(x, ITEM_BY_ID[it].icon, 18, ix - 9, iy - 16); });
        break;
      }
      case 'order_board': {
        for (const u of [0.35, w - 0.35]) box(x, u - 0.07, h * 0.55 - 0.07, u + 0.07, h * 0.55 + 0.07, 0, 72, '#8d5a33');
        onFace(x, 'S', h * 0.55 + 0.08, 0.15, w - 0.15, 30, 74, '#a0673a', 1.8);
        onFace(x, 'S', h * 0.55 + 0.09, 0.25, w - 0.25, 34, 70, '#c99a5b', 1.2);
        for (const [u, z] of [[0.45, 50], [1.05, 54], [0.7, 36], [1.4, 40]] as const) { onFace(x, 'S', h * 0.55 + 0.1, u - 0.17, u + 0.17, z, z + 16, '#f7f8f4', 1); const [px, py] = P(u, h * 0.55 + 0.1, z + 15); ellipse(x, px, py, 1.8, 1.8); x.fillStyle = '#d8434b'; x.fill(); }
        break;
      }
      case 'market': {
        box(x, 0.25, 0.4, w - 0.25, h - 0.3, 0, 24, '#d9a766');
        ['bread', 'jam', 'basket'].forEach((it, k) => { const [ix, iy] = P(0.7 + k * 0.8, h / 2, 24); drawIcon(x, ITEM_BY_ID[it].icon, 20, ix - 10, iy - 18); });
        for (const [px, py] of [[0.3, 0.45], [w - 0.3, 0.45], [0.3, h - 0.35], [w - 0.3, h - 0.35]]) box(x, px - 0.05, py - 0.05, px + 0.05, py + 0.05, 24, 70, '#8d6e44');
        for (let k = 0; k < 8; k++) {
          const a = 0.05 + (k * (w - 0.1)) / 8, c = 0.05 + ((k + 1) * (w - 0.1)) / 8;
          face(x, [[a, 0.2, 80], [c, 0.2, 80], [c, h, 62], [a, h, 62]], k % 2 ? b.roof : '#f7f8f4', 1);
        }
        break;
      }
      case 'apiary': {
        for (const [cx, cy] of [[0.8, 0.8], [2.1, 0.9], [1.3, 2.1]] as const) {
          for (let k = 0; k < 3; k++) box(x, cx - 0.4, cy - 0.35, cx + 0.4, cy + 0.35, k * 12, k * 12 + 11, k % 2 ? '#ffca28' : '#ffb300');
          box(x, cx - 0.48, cy - 0.43, cx + 0.48, cy + 0.43, 36, 41, '#8d5a33');
          onFace(x, 'S', cy + 0.35, cx - 0.12, cx + 0.12, 2, 5, INK, 0.8);
        }
        break;
      }
      case 'greenhouse': {
        for (let k = 0; k < 6; k++) { const [px, py] = P(0.6 + (k % 3) * 1.3, 0.8 + Math.floor(k / 3) * 1.2, 0); ellipse(x, px, py - 8, 12, 9); fs(x, '#5fa046', 1.2); ellipse(x, px - 2, py - 11, 2.4, 2.4); x.fillStyle = '#e53950'; x.fill(); }
        const glass = 'rgba(190,235,250,.55)';
        face(x, [[X0, Y1, 0], [X1, Y1, 0], [X1, Y1, wallH], [X0, Y1, wallH]], glass, 1.6, '#4f7a8c');
        face(x, [[X1, Y0, 0], [X1, Y1, 0], [X1, Y1, wallH], [X1, Y0, wallH]], 'rgba(160,215,235,.6)', 1.6, '#4f7a8c');
        const ym = h / 2;
        face(x, [[X0 - 0.1, Y1 + 0.1, wallH], [X1 + 0.1, Y1 + 0.1, wallH], [X1 + 0.1, ym, wallH + roofH], [X0 - 0.1, ym, wallH + roofH]], 'rgba(210,245,255,.7)', 1.6, '#4f7a8c');
        face(x, [[X1 + 0.1, Y0, wallH], [X1 + 0.1, Y1 + 0.1, wallH], [X1 + 0.1, ym, wallH + roofH]], 'rgba(170,220,240,.7)', 1.4, '#4f7a8c');
        x.strokeStyle = '#4f7a8c'; x.lineWidth = 1.4;
        for (let k = 1; k < 5; k++) { const u = X0 + ((X1 - X0) * k) / 5; x.beginPath(); x.moveTo(...P(u, Y1, 0)); x.lineTo(...P(u, Y1, wallH)); x.lineTo(...P(u, ym, wallH + roofH)); x.stroke(); }
        x.fillStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.moveTo(...P(X0 + 0.3, Y1, wallH * 0.2)); x.lineTo(...P(X0 + 0.7, Y1, wallH * 0.2)); x.lineTo(...P(X0 + 0.5, Y1, wallH * 0.85)); x.closePath(); x.fill();
        break;
      }
      case 'mill': {
        const t0 = 0.45, t1 = w - 0.45;
        box(x, t0, t0, t1, h - 0.45, 0, wallH * 1.7, b.wall);
        for (const z of [wallH * 0.5, wallH * 1.15]) windowOn(x, 'S', h - 0.45, w / 2, z, 0.36, 12);
        door(x, 'E', t1, h / 2, 26, shade(b.roof, -0.35));
        pyramid(x, t0, t0, t1, h - 0.45, wallH * 1.7, wallH * 1.7 + roofH * 1.2, b.roof);
        anchor('hub', P(w / 2 + 0.1, h - 0.45, wallH * 1.45));
        break;
      }
      default: {
        const style = STYLE[b.id] ?? 'gable';
        // paredes
        box(x, X0, Y0, X1, Y1, 0, wallH, b.wall, shade(b.wall, 0.1));
        // tábuas / textura
        x.strokeStyle = shade(b.wall, -0.12); x.lineWidth = 1;
        for (let z = 10; z < wallH - 4; z += 10) { x.beginPath(); x.moveTo(...P(X0, Y1, z)); x.lineTo(...P(X1, Y1, z)); x.lineTo(...P(X1, Y0, z)); x.stroke(); }
        // porta (face sul, centro, onde fica o tile de entrada)
        const du = Math.floor(w / 2) + 0.5;
        if (b.id === 'barn' || b.id === 'warehouse' || b.id === 'great_workshop') {
          onFace(x, 'S', Y1, du - 0.75, du + 0.75, 0, wallH * 0.78, shade(b.wall, -0.4), 1.6);
          x.strokeStyle = '#f7f8f4'; x.lineWidth = 2.4;
          x.beginPath(); x.moveTo(...P(du - 0.75, Y1, 0)); x.lineTo(...P(du + 0.75, Y1, wallH * 0.78)); x.moveTo(...P(du + 0.75, Y1, 0)); x.lineTo(...P(du - 0.75, Y1, wallH * 0.78)); x.stroke();
          face(x, [[du - 0.75, Y1, 0], [du + 0.75, Y1, 0], [du + 0.75, Y1, wallH * 0.78], [du - 0.75, Y1, wallH * 0.78]], 'rgba(0,0,0,0)', 2.4, '#f7f8f4');
        } else door(x, 'S', Y1, du, Math.min(30, wallH * 0.6), shade(b.roof, -0.35));
        // janelas
        for (let u = 0.6; u < w - 0.4; u += 1.2) if (Math.abs(u - du) > 0.6) windowOn(x, 'S', Y1, u, wallH * 0.38);
        for (let u = 0.7; u < h - 0.3; u += 1.3) windowOn(x, 'E', X1, u, wallH * 0.38);
        // telhado
        const axis = w >= h ? 'x' : 'y';
        if (style === 'gable') gable(x, X0, Y0, X1, Y1, wallH, wallH + roofH, b.roof, axis);
        else if (style === 'barn') gable(x, X0, Y0, X1, Y1, wallH, wallH + roofH * 1.25, b.roof, axis, 0.2, '#f7f8f4');
        else if (style === 'pyramid') pyramid(x, X0, Y0, X1, Y1, wallH, wallH + roofH, b.roof);
        else if (style === 'flat') {
          box(x, X0 - 0.12, Y0 - 0.12, X1 + 0.12, Y1 + 0.12, wallH, wallH + 7, b.roof);
          box(x, X0 + 0.4, Y0 + 0.4, X0 + 1.4, Y0 + 1.2, wallH + 7, wallH + 18, shade(b.roof, -0.1));
        } else if (style === 'dome') {
          box(x, X0 - 0.08, Y0 - 0.08, X1 + 0.08, Y1 + 0.08, wallH, wallH + 5, shade(b.wall, -0.2));
          const [dx, dy] = P(w / 2, h / 2, wallH + 5);
          const r = (TW / 2) * Math.min(w, h) * 0.42;
          x.beginPath(); x.ellipse(dx, dy, r, r * 0.5, 0, 0, Math.PI * 2); x.fillStyle = shade(b.roof, -0.2); x.fill();
          x.beginPath(); x.ellipse(dx, dy, r, r * 0.95, 0, Math.PI, 0); x.closePath(); fs(x, b.roof, 1.8);
          x.beginPath(); x.ellipse(dx - r * 0.3, dy - r * 0.5, r * 0.22, r * 0.14, -0.5, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.3)'; x.fill();
        }
        if (CHIMNEYS.has(b.id)) {
          const cx = X0 + (X1 - X0) * 0.72, cy = Y0 + (Y1 - Y0) * 0.3;
          chimney(x, cx, cy, wallH, wallH + roofH * 0.95 + 8);
          anchor('smoke', P(cx, cy, wallH + roofH * 0.95 + 14));
        }
        // varanda da casa e toras da serraria
        if (b.id === 'farmhouse') {
          box(x, X0 + 0.3, Y1, X1 - 0.3, Y1 + 0.55, 0, 5, '#a0673a');
          for (let u = X0 + 0.45; u < X1 - 0.3; u += 0.55) box(x, u - 0.04, Y1 + 0.48, u + 0.04, Y1 + 0.56, 5, 16, '#c99a5b', undefined, 1);
        }
        if (b.id === 'sawmill') for (let k = 0; k < 3; k++) box(x, X1 + 0.02, Y0 + 0.2 + k * 0.32, X1 + 0.32, Y0 + 0.48 + k * 0.32, 0, 9 + (k % 2) * 4, '#a0673a');
        // placa com o produto
        if (product) { const [px, py] = P(X0 + 0.35, Y1, wallH * 0.78); plaque(x, px, py, product, 0.9); }
      }
    }
  });
}

/** Lote vazio: contorno tracejado e placa "+". */
export function isoLotArt(w: number, h: number): IsoArt {
  return art(w, h, 70, (x) => {
    x.beginPath(); [[0.15, 0.15], [w - 0.15, 0.15], [w - 0.15, h - 0.15], [0.15, h - 0.15]].forEach(([a, b], i) => { const [sx, sy] = P(a, b, 0); if (i) x.lineTo(sx, sy); else x.moveTo(sx, sy); }); x.closePath();
    x.fillStyle = 'rgba(255,255,255,.16)'; x.fill(); x.setLineDash([7, 5]); x.lineWidth = 2.4; x.strokeStyle = 'rgba(29,59,114,.6)'; x.stroke(); x.setLineDash([]);
    const [sx, sy] = P(w / 2, h / 2, 0);
    rrect(x, sx - 2.5, sy - 44, 5, 44, 1.5); fs(x, '#8d5a33', 1.4);
    rrect(x, sx - 17, sy - 62, 34, 22, 6); fs(x, '#f7f8f4', 2.4, '#1d3b72');
    x.strokeStyle = '#1d3b72'; x.lineWidth = 3.2; x.beginPath(); x.moveTo(sx - 6, sy - 51); x.lineTo(sx + 6, sy - 51); x.moveTo(sx, sy - 57); x.lineTo(sx, sy - 45); x.stroke();
  });
}

/** Obra em andamento: andaimes, tábuas e materiais. */
export function isoConstructionArt(w: number, h: number): IsoArt {
  const zt = 30 + 8 * Math.min(w, h);
  return art(w, h, zt + 30, (x, anchor) => {
    groundShadow(x, w, h);
    box(x, 0.2, 0.2, w - 0.2, h - 0.2, 0, 4, '#c9a46e');
    const posts: [number, number][] = [[0.3, 0.3], [w - 0.3, 0.3], [w - 0.3, h - 0.3], [0.3, h - 0.3]];
    for (const [a, b] of posts.slice(0, 2)) box(x, a - 0.05, b - 0.05, a + 0.05, b + 0.05, 4, zt, '#8d5a33', undefined, 1.2);
    // vigas horizontais
    x.strokeStyle = '#8d5a33'; x.lineWidth = 3;
    for (const z of [zt * 0.45, zt]) { x.beginPath(); posts.concat([posts[0]]).forEach(([a, b], i) => (i ? x.lineTo(...P(a, b, z)) : x.moveTo(...P(a, b, z)))); x.stroke(); }
    x.lineWidth = 2; x.strokeStyle = '#a0673a'; x.beginPath(); x.moveTo(...P(0.3, h - 0.3, 4)); x.lineTo(...P(w - 0.3, h - 0.3, zt)); x.moveTo(...P(w - 0.3, 0.3, 4)); x.lineTo(...P(w - 0.3, h - 0.3, zt * 0.9)); x.stroke();
    for (const [a, b] of posts.slice(2)) box(x, a - 0.05, b - 0.05, a + 0.05, b + 0.05, 4, zt, '#8d5a33', undefined, 1.2);
    for (let k = 0; k < 3; k++) box(x, 0.5 + k * 0.1, h - 1 + k * 0.05, 1.6 + k * 0.1, h - 0.75 + k * 0.05, 4 + k * 4, 8 + k * 4, '#d9a766', undefined, 1.2);
    box(x, w - 1.1, h - 1.1, w - 0.5, h - 0.5, 4, 18, '#c99a5b');
    anchor('top', P(w / 2, h / 2, zt + 14));
  });
}

// ---------------------------------------------------------------- canteiros e cultivos (2x2 tiles)
const PS = FIELD.size;
export function isoSoilArt(locked: boolean): IsoArt {
  return art(PS, PS, 10, (x) => {
    const col = locked ? '#8c7656' : '#7a5230';
    box(x, 0.06, 0.06, PS - 0.06, PS - 0.06, 0, 5, shade(col, -0.1), col, 1.4);
    x.strokeStyle = locked ? '#9a8566' : '#93673a'; x.lineWidth = 3;
    for (let k = 0; k < 4; k++) { const y = 0.3 + k * 0.47; x.beginPath(); x.moveTo(...P(0.25, y, 5)); x.lineTo(...P(PS - 0.25, y, 5)); x.stroke(); }
    if (locked) { x.fillStyle = 'rgba(40,40,40,.22)'; x.beginPath(); [[0.06, 0.06], [PS - 0.06, 0.06], [PS - 0.06, PS - 0.06], [0.06, PS - 0.06]].forEach(([a, b], i) => (i ? x.lineTo(...P(a, b, 5)) : x.moveTo(...P(a, b, 5)))); x.fill(); }
  });
}

export function isoCropArt(crop: string, stage: number): IsoArt {
  const def = CROPS.find((k) => k.id === crop)!;
  const col = def.color;
  const kind = ['wheat', 'corn'].includes(crop) ? 'tall' : ['carrot', 'potato'].includes(crop) ? 'root' : ['rose', 'tulip', 'lavender', 'sunflower'].includes(crop) ? 'flower' : crop === 'pumpkin' ? 'vine' : 'bush';
  const spots: [number, number][] = [[0.5, 0.5], [1.5, 0.5], [1, 1], [0.5, 1.5], [1.5, 1.5]];
  return art(PS, PS, 70, (x, anchor) => {
    for (const [tx, ty] of spots) {
      const [px, py] = P(tx, ty, 5);
      if (stage === 0) {
        x.strokeStyle = INK; x.lineWidth = 3; x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 8); x.stroke(); x.strokeStyle = '#7cb342'; x.lineWidth = 2; x.stroke();
        ellipse(x, px - 4, py - 9, 4, 2.4, -0.5); fs(x, '#8bc34a', 1.2); ellipse(x, px + 4, py - 9, 4, 2.4, 0.5); fs(x, '#8bc34a', 1.2);
        continue;
      }
      const hh = stage === 1 ? 0.55 : 1;
      if (kind === 'tall') {
        for (const dx of [-4, 0, 4]) {
          x.beginPath(); x.moveTo(px + dx * 0.5, py); x.lineTo(px + dx, py - 30 * hh); x.lineWidth = 3; x.strokeStyle = INK; x.stroke(); x.lineWidth = 2; x.strokeStyle = stage === 2 && crop === 'wheat' ? '#c9a43a' : '#6fa83a'; x.stroke();
          if (stage === 2) { if (crop === 'wheat') { ellipse(x, px + dx, py - 33, 2.6, 7); fs(x, col, 1.2); } else { ellipse(x, px + dx + 2, py - 22, 3, 7, 0.3); fs(x, col, 1.2); } }
        }
      } else if (kind === 'root') {
        for (const r of [-0.5, 0, 0.5]) { ellipse(x, px + r * 8, py - 10 * hh, 3, 9 * hh, r); fs(x, '#5fa046', 1.3); }
        if (stage === 2) { ellipse(x, px, py - 1, crop === 'potato' ? 7 : 5, 4.5); fs(x, col, 1.5); }
      } else if (kind === 'flower') {
        x.strokeStyle = '#558b2f'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 26 * hh); x.stroke();
        ellipse(x, px - 5, py - 9, 5, 2.4, 0.5); fs(x, '#7cb342', 1.1);
        if (stage === 2) {
          if (crop === 'lavender') for (let k = 0; k < 4; k++) { ellipse(x, px, py - 27 - k * 4, 2.8, 2.4); fs(x, col, 1); }
          else { for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ellipse(x, px + Math.cos(a) * 4.6, py - 28 + Math.sin(a) * 4.6, 3.5, 3.5); fs(x, col, 1); } ellipse(x, px, py - 28, 2.6, 2.6); x.fillStyle = crop === 'sunflower' ? '#6d4c41' : '#fff59d'; x.fill(); }
        } else { ellipse(x, px, py - 26 * hh, 3, 4); fs(x, '#9ccc65', 1.1); }
      } else if (kind === 'vine') {
        ellipse(x, px, py - 6, 11 * hh, 7 * hh); fs(x, '#5fa046', 1.5);
        if (stage === 2) { ellipse(x, px + 2, py - 6, 10, 8); fs(x, col, 1.8); x.strokeStyle = shade(col, -0.2); x.lineWidth = 1.2; x.beginPath(); x.moveTo(px + 2, py - 14); x.lineTo(px + 2, py + 2); x.stroke(); }
      } else {
        ellipse(x, px, py - 9 * hh, 10 * hh + 2, 8 * hh + 2); fs(x, crop === 'cotton' ? '#6d8a3a' : '#4f9a3c', 1.5);
        if (stage === 2) for (const [a, b2] of [[-5, -12], [5, -9], [0, -5], [-3, -4]]) { ellipse(x, px + a, py + b2, crop === 'cotton' ? 4 : 3, crop === 'cotton' ? 4 : 3); fs(x, col, 1.1); }
      }
    }
    if (stage === 2) {
      const [bx, by] = P(PS / 2, PS / 2, 52);
      ellipse(x, bx, by, 8, 8); fs(x, '#f2b632', 2.2); x.fillStyle = INK; x.font = 'bold 12px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', bx, by + 1);
    }
    anchor('top', P(PS / 2, PS / 2, 40));
  });
}

// ---------------------------------------------------------------- terreno-ilha
export function drawIsoGround(): HTMLCanvasElement {
  const { c, ctx: g } = canvas(WORLD_W, WORLD_H);
  const rand = mulberry(11);
  const hard = buildingTiles();
  const diamond = (tx: number, ty: number, s = 1) => {
    const ctr = isoTile(tx + 0.5, ty + 0.5), hw = (TW / 2) * s, hh = (TH / 2) * s;
    g.beginPath(); g.moveTo(ctr.x, ctr.y - hh); g.lineTo(ctr.x + hw, ctr.y); g.lineTo(ctr.x, ctr.y + hh); g.lineTo(ctr.x - hw, ctr.y); g.closePath();
  };
  const at = (tx: number, ty: number) => isoTile(tx, ty);

  // laterais da ilha (desenhadas primeiro, ficam por baixo da borda)
  const D = 118;
  const side = (ax: number, ay: number, bx: number, by: number, dark: number) => {
    const a = at(ax, ay), b = at(bx, by);
    const layers: [number, number, string][] = [[0, 10, '#5f8f3a'], [10, 34, '#8a5a35'], [34, 70, '#74492c'], [70, D, '#5b3a25']];
    for (const [z0, z1, col] of layers) {
      g.beginPath(); g.moveTo(a.x, a.y + z0); g.lineTo(b.x, b.y + z0); g.lineTo(b.x, b.y + z1); g.lineTo(a.x, a.y + z1); g.closePath();
      g.fillStyle = shade(col, dark); g.fill();
    }
    // pedras e raízes
    for (let i = 0; i < 70; i++) {
      const t = rand(), z = 16 + rand() * (D - 24);
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t + z;
      ellipse(g, px, py, 3 + rand() * 6, 2 + rand() * 3); g.fillStyle = shade('#9a8a78', dark - 0.1 - rand() * 0.2); g.fill();
    }
    // borda inferior irregular
    g.beginPath(); g.moveTo(a.x, a.y + D);
    for (let t = 0; t <= 1.0001; t += 0.02) g.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + D + (rand() * 14));
    g.lineTo(b.x, b.y + D); g.closePath(); g.fillStyle = shade('#4a2e1d', dark); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  };
  side(0, MAP_H, MAP_W, MAP_H, 0);       // face sudoeste (iluminada)
  side(MAP_W, 0, MAP_W, MAP_H, -0.25);   // face sudeste (sombra)
  // cachoeira onde o rio sai pela borda leste
  {
    const a = at(MAP_W, RIVER.y0), b = at(MAP_W, RIVER.y1 + 1);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(b.x, b.y + D + 18); g.lineTo(a.x, a.y + D + 18); g.closePath();
    g.fillStyle = '#7cc3e0'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
    for (let i = 0; i < 26; i++) { const t = rand(), px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t; g.beginPath(); g.moveTo(px, py + 4); g.lineTo(px, py + 20 + rand() * (D - 10)); g.stroke(); }
    for (let i = 0; i < 14; i++) { const t = rand(); ellipse(g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + D + 14, 8 + rand() * 8, 4); g.fillStyle = 'rgba(255,255,255,.8)'; g.fill(); }
  }

  // ladrilhos de terreno
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const reg = regionAt(tx, ty);
    const base = reg ? REGIONS.find((r) => r.id === reg)!.ground : '#3f6e35';
    diamond(tx, ty, 1.02);
    g.fillStyle = shade(base, (rand() - 0.5) * 0.05); g.fill();
  }
  // margens arenosas e água
  for (let ty = RIVER.y0 - 1; ty <= RIVER.y1 + 1; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (isWater(tx, ty)) continue;
    if (ty === RIVER.y0 - 1 || ty === RIVER.y1 + 1 || BRIDGES.some((b) => tx >= b.x0 && tx <= b.x1)) { diamond(tx, ty, 1.04); g.fillStyle = shade('#dcc68e', (rand() - 0.5) * 0.05); g.fill(); }
  }
  for (let ty = RIVER.y0; ty <= RIVER.y1; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    diamond(tx, ty, 1.03); g.fillStyle = ty === RIVER.y0 || ty === RIVER.y1 ? '#4a9cc6' : '#3f8fbd'; g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.6;
  for (let i = 0; i < 220; i++) {
    const tx = rand() * MAP_W, ty = RIVER.y0 + 0.2 + rand() * (RIVER.y1 - RIVER.y0 + 0.6);
    const p = isoTile(tx, ty); g.beginPath(); g.moveTo(p.x, p.y); g.quadraticCurveTo(p.x + 5, p.y - 2, p.x + 10, p.y); g.stroke();
  }
  // pontes
  for (const b of BRIDGES) {
    for (let ty = RIVER.y0 - 1; ty <= RIVER.y1 + 1; ty++) for (let tx = b.x0; tx <= b.x1; tx++) {
      diamond(tx, ty, 1.0); g.fillStyle = (ty % 2) ? '#c99a5b' : '#b8874a'; g.fill(); g.strokeStyle = '#7a5530'; g.lineWidth = 1; g.stroke();
    }
    for (const tx of [b.x0, b.x1 + 1]) {
      const p0 = isoTile(tx, RIVER.y0 - 1), p1 = isoTile(tx, RIVER.y1 + 2);
      g.strokeStyle = '#6b3f22'; g.lineWidth = 4; g.beginPath(); g.moveTo(p0.x, p0.y - 12); g.lineTo(p1.x, p1.y - 12); g.stroke();
      for (let ty = RIVER.y0 - 1; ty <= RIVER.y1 + 2; ty++) { const p = isoTile(tx, ty); g.lineWidth = 3; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 14); g.stroke(); }
    }
  }
  // caminhos de terra (losangos levemente maiores para arredondar)
  for (const k of PATH_TILES) {
    const [tx, ty] = k.split(',').map(Number);
    if (isWater(tx, ty) || !regionAt(tx, ty)) continue;
    diamond(tx, ty, 1.14); g.fillStyle = '#b48a52'; g.fill();
  }
  for (const k of PATH_TILES) {
    const [tx, ty] = k.split(',').map(Number);
    if (isWater(tx, ty) || !regionAt(tx, ty)) continue;
    diamond(tx, ty, 0.98); g.fillStyle = shade('#d6b47a', (rand() - 0.5) * 0.06); g.fill();
    for (let i = 0; i < 3; i++) { const p = isoTile(tx + rand(), ty + rand()); ellipse(g, p.x, p.y, 1.6, 1); g.fillStyle = 'rgba(140,100,60,.5)'; g.fill(); }
  }
  // moldura de terra do campo + cerca
  {
    const x0 = FIELD.x - 0.25, y0 = FIELD.y - 0.25, x1 = FIELD.x + FIELD.cols * FIELD.size + 0.25, y1 = FIELD.y + FIELD.rows * FIELD.size + 0.25;
    const q = [isoTile(x0, y0), isoTile(x1, y0), isoTile(x1, y1), isoTile(x0, y1)];
    g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fillStyle = '#9c7a4a'; g.fill();
    const fence = (ax: number, ay: number, bx: number, by: number) => {
      const n = Math.round(Math.hypot(bx - ax, by - ay) * 2);
      for (let i = 0; i <= n; i++) { const p = isoTile(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n); rrect(g, p.x - 2, p.y - 13, 4, 13, 1.2); fs(g, '#c99a5b', 1.2); }
      const a = isoTile(ax, ay), b = isoTile(bx, by);
      g.strokeStyle = '#8d5a33'; g.lineWidth = 2.2; for (const dz of [9, 4]) { g.beginPath(); g.moveTo(a.x, a.y - dz); g.lineTo(b.x, b.y - dz); g.stroke(); }
    };
    fence(x0, y0, x1, y0); fence(x0, y0, x0, y1);
    // cerca da frente desenhada no chão também (é baixa)
    fence(x0, y1, x1, y1); fence(x1, y0, x1, y1);
  }
  // detalhes por região
  for (let i = 0; i < 5200; i++) {
    const tx = rand() * MAP_W, ty = rand() * MAP_H;
    const ix = Math.floor(tx), iy = Math.floor(ty);
    const reg = regionAt(ix, iy);
    if (!reg || PATH_TILES.has(`${ix},${iy}`) || hard.has(`${ix},${iy}`) || (iy >= RIVER.y0 - 1 && iy <= RIVER.y1 + 1)) continue;
    const p = isoTile(tx, ty);
    const kind = rand();
    if (reg === 'colinas' && kind < 0.25) { ellipse(g, p.x, p.y, 3 + rand() * 4, 1.6 + rand() * 2); g.fillStyle = 'rgba(120,110,90,.4)'; g.fill(); continue; }
    if (reg === 'planalto' && kind < 0.3) { g.strokeStyle = 'rgba(90,70,40,.3)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 7, p.y + 2); g.lineTo(p.x + 11, p.y - 1); g.stroke(); continue; }
    if ((reg === 'vale' && kind < 0.5) || kind < 0.08) {
      const col = ['#f28cb1', '#fff176', '#ffffff', '#ce93d8', '#ffab91'][Math.floor(rand() * 5)];
      for (let k = 0; k < 4; k++) { ellipse(g, p.x + Math.cos(k * 1.57) * 2.2, p.y + Math.sin(k * 1.57) * 1.2, 1.9, 1.4); g.fillStyle = col; g.fill(); }
      ellipse(g, p.x, p.y, 1.2, 0.8); g.fillStyle = '#f9a825'; g.fill();
      continue;
    }
    if (reg === 'bosque' && kind < 0.3) { ellipse(g, p.x, p.y, 3, 1.4, rand()); g.fillStyle = 'rgba(120,80,30,.32)'; g.fill(); continue; }
    g.strokeStyle = 'rgba(40,90,30,.38)'; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(p.x - 3, p.y + 1); g.lineTo(p.x - 2, p.y - 4); g.moveTo(p.x, p.y + 1); g.lineTo(p.x + 0.5, p.y - 5); g.moveTo(p.x + 3, p.y + 1); g.lineTo(p.x + 3.5, p.y - 3); g.stroke();
  }
  return c;
}

/** Miniatura do terreno para o minimapa / telas (mesma projeção, escalada). */
export function groundThumb(ground: HTMLCanvasElement, width: number) {
  const s = width / ground.width;
  const { c, ctx } = canvas(Math.round(width), Math.round(ground.height * s));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(ground, 0, 0, c.width, c.height);
  return { c, s };
}
