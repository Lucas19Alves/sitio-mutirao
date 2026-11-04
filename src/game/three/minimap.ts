// Miniatura do mapa (4 px por tile) para o minimapa da interface.
import { BUILDINGS, MAP_W, MAP_H, RIVER, PATH_TILES, regionAt, isWater } from '../../data/catalog.ts';

export function minimapCanvas() {
  const S = 4;
  const c = document.createElement('canvas'); c.width = MAP_W * S; c.height = MAP_H * S;
  const x = c.getContext('2d')!;
  const col: Record<string, string> = { sitio: '#7fc14f', pomar: '#8ac657', bosque: '#5f9c42', rio: '#8dc95c', colinas: '#a3ae5e', vale: '#93d067', planalto: '#b5a866' };
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const r = regionAt(tx, ty);
    x.fillStyle = isWater(tx, ty) ? '#5fb6dc' : ty >= RIVER.y0 && ty <= RIVER.y1 ? '#b9824e' : PATH_TILES.has(`${tx},${ty}`) && r ? '#e2c08c' : r ? col[r] : '#3f7a35';
    x.fillRect(tx * S, ty * S, S, S);
  }
  for (const b of BUILDINGS) { x.fillStyle = '#c4473f'; x.fillRect(b.spot.x * S + 1, b.spot.y * S + 1, b.spot.w * S - 2, b.spot.h * S - 2); }
  return c;
}
