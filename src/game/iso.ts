// Projeção isométrica 2:1. A lógica do jogo continua numa grade quadrada
// (tiles de 32 "px lógicos", igual ao servidor); só a exibição é isométrica.
import { MAP_W, MAP_H, TILE } from '../data/world.ts';

export const TW = 64; // largura do losango na tela
export const TH = 32; // altura do losango na tela
export const PAD_X = 64;
export const PAD_TOP = 180;
export const PAD_BOTTOM = 150; // laterais de terra da ilha
export const ISO_OX = MAP_H * (TW / 2) + PAD_X;
export const ISO_OY = PAD_TOP;
export const WORLD_W = (MAP_W + MAP_H) * (TW / 2) + PAD_X * 2;
export const WORLD_H = (MAP_W + MAP_H) * (TH / 2) + PAD_TOP + PAD_BOTTOM;

/** Coordenada de tile (pode ser fracionária) → tela. */
export function isoTile(tx: number, ty: number) {
  return { x: (tx - ty) * (TW / 2) + ISO_OX, y: (tx + ty) * (TH / 2) + ISO_OY };
}

/** px lógico (grade de 32) → tela. */
export const isoL = (lx: number, ly: number) => isoTile(lx / TILE, ly / TILE);

/** Tela → tile (fracionário). */
export function screenToTile(sx: number, sy: number) {
  const a = (sx - ISO_OX) / (TW / 2), b = (sy - ISO_OY) / (TH / 2);
  return { tx: (a + b) / 2, ty: (b - a) / 2 };
}

/** Delta lógico → delta na tela (para escolher a direção do sprite). */
export const isoDelta = (dx: number, dy: number) => ({ x: dx - dy, y: (dx + dy) / 2 });
