// Visão top-down ortográfica: 1 px lógico = 1 px de mundo (tile de 32).
import { MAP_W, MAP_H, TILE } from '../data/world.ts';

export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** Coordenada de tile (pode ser fracionária) → mundo. */
export const tileToWorld = (tx: number, ty: number) => ({ x: tx * TILE, y: ty * TILE });
/** Mundo → tile (fracionário). */
export const worldToTile = (x: number, y: number) => ({ tx: x / TILE, ty: y / TILE });
