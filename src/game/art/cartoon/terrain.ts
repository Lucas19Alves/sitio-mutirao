// Tileset do terreno (pintado a 64 px por tile, exibido a 32) e as camadas do mapa.
// Camadas: chão (grama por bioma), mescla entre biomas, e cobertura (caminhos/água).
import { MAP_W, MAP_H, PATH_TILES, RIVER, regionAt, isWater } from '../../../data/catalog.ts';
import { mulberry } from '../draw.ts';
import { cv, ell, shade, type Ctx } from './paint.ts';

export const TS = 64;      // px do tile no tileset
export const PAD = 2;      // extrusão de borda (evita emendas com filtragem linear)
export const CELL = TS + PAD * 2;
export const COLS = 12;

export const BIOMES = ['sitio', 'pomar', 'bosque', 'rio', 'colinas', 'vale', 'planalto', 'border'] as const;
type Biome = typeof BIOMES[number];
const BASE: Record<Biome, string> = {
  sitio: '#7cbf4f', pomar: '#86c457', bosque: '#649f45', rio: '#8cc85b',
  colinas: '#a1ae5c', vale: '#8ccd62', planalto: '#b6a764', border: '#4f8a3c',
};
const VARIANTS = 4;
export const IDX = {
  grass: (b: number, v: number) => b * VARIANTS + v,            // 0..31
  path: (mask: number) => 32 + mask,                            // 32..47
  waterTop: 48, waterMid: 49, waterBot: 50,
  blend: (b: number, dir: number) => 52 + b * 4 + dir,          // 52..83
};
const COUNT = 84;

/** Desenha repetindo nas 8 vizinhanças, para a textura fechar sem emenda. */
function wrap(x: Ctx, draw: () => void) {
  for (const dy of [-TS, 0, TS]) for (const dx of [-TS, 0, TS]) { x.save(); x.translate(dx, dy); draw(); x.restore(); }
}

function grassTile(x: Ctx, biome: Biome, seed: number) {
  const base = BASE[biome];
  const r = mulberry(seed);
  x.fillStyle = base; x.fillRect(0, 0, TS, TS);
  const blot = Array.from({ length: 7 }, () => ({ cx: r() * TS, cy: r() * TS, rx: 8 + r() * 14, ry: 6 + r() * 10, k: (r() - 0.5) * 0.12 }));
  const blades = Array.from({ length: 16 }, () => ({ cx: r() * TS, cy: r() * TS, h: 3 + r() * 4, k: r() < 0.5 ? -0.16 : 0.14 }));
  const extras = Array.from({ length: 6 }, () => ({ cx: r() * TS, cy: r() * TS, t: r(), c: r() }));
  wrap(x, () => {
    for (const b of blot) { ell(x, b.cx, b.cy, b.rx, b.ry); x.fillStyle = shade(base, b.k); x.globalAlpha = 0.55; x.fill(); x.globalAlpha = 1; }
    x.lineWidth = 1.6;
    for (const b of blades) {
      x.strokeStyle = shade(base, b.k);
      x.beginPath(); x.moveTo(b.cx - 2, b.cy + 2); x.lineTo(b.cx - 1, b.cy - b.h); x.moveTo(b.cx + 1, b.cy + 2); x.lineTo(b.cx + 2.5, b.cy - b.h + 1); x.stroke();
    }
    for (const e of extras) {
      if (biome === 'vale' || (biome === 'pomar' && e.t < 0.5) || (biome === 'sitio' && e.t < 0.25)) {
        const col = ['#f7a6c4', '#fff3a6', '#ffffff', '#d7b6ff'][Math.floor(e.c * 4)];
        for (let k = 0; k < 5; k++) { ell(x, e.cx + Math.cos(k * 1.26) * 1.8, e.cy + Math.sin(k * 1.26) * 1.8, 1.4, 1.4); x.fillStyle = col; x.fill(); }
        ell(x, e.cx, e.cy, 0.9, 0.9); x.fillStyle = '#f5b82e'; x.fill();
      } else if (biome === 'colinas' || biome === 'planalto') {
        ell(x, e.cx, e.cy, 2 + e.t * 3, 1.4 + e.t * 2); x.fillStyle = shade(biome === 'colinas' ? '#a99c7c' : '#c4a878', -0.1 * e.c); x.fill();
      } else if (biome === 'bosque' || biome === 'border') {
        ell(x, e.cx, e.cy, 2.4, 1.2, e.c * 3); x.fillStyle = 'rgba(120,80,30,.35)'; x.fill();
      } else if (e.t < 0.4) {
        ell(x, e.cx, e.cy, 1.6, 1.1); x.fillStyle = 'rgba(255,255,255,.35)'; x.fill();
      }
    }
  });
}

/** Caminho de terra. mask: N=1 E=2 S=4 W=8 (vizinhos que também são caminho). */
function pathTile(x: Ctx, mask: number, seed: number) {
  const r = mulberry(seed);
  const a = 11, b = TS - 11;
  const shape = () => {
    x.beginPath();
    x.roundRect(a, a, b - a, b - a, 14);
    if (mask & 1) x.rect(a, -4, b - a, TS / 2 + 4);
    if (mask & 4) x.rect(a, TS / 2, b - a, TS / 2 + 4);
    if (mask & 8) x.rect(-4, a, TS / 2 + 4, b - a);
    if (mask & 2) x.rect(TS / 2, a, TS / 2 + 4, b - a);
  };
  // borda mais escura (rebaixo), depois o miolo
  shape(); x.save(); x.lineWidth = 7; x.strokeStyle = '#b88a52'; x.stroke(); x.restore();
  shape(); x.fillStyle = '#b88a52'; x.fill();
  x.save(); shape(); x.clip();
  const g = x.createLinearGradient(0, 0, TS, TS); g.addColorStop(0, '#e2bf88'); g.addColorStop(1, '#d1a66c');
  x.fillStyle = g; x.fillRect(a + 3, a + 3, b - a - 6, b - a - 6);
  if (mask & 1) x.fillRect(a + 3, -4, b - a - 6, TS / 2 + 4);
  if (mask & 4) x.fillRect(a + 3, TS / 2, b - a - 6, TS / 2 + 4);
  if (mask & 8) x.fillRect(-4, a + 3, TS / 2 + 4, b - a - 6);
  if (mask & 2) x.fillRect(TS / 2, a + 3, TS / 2 + 4, b - a - 6);
  for (let i = 0; i < 9; i++) { ell(x, 8 + r() * 48, 8 + r() * 48, 1.4 + r() * 1.8, 1 + r() * 1.2); x.fillStyle = r() < 0.5 ? 'rgba(140,100,60,.45)' : 'rgba(255,245,220,.5)'; x.fill(); }
  x.restore();
}

function waterTile(x: Ctx, kind: 'top' | 'mid' | 'bot', seed: number) {
  const r = mulberry(seed);
  const g = x.createLinearGradient(0, 0, 0, TS);
  g.addColorStop(0, '#62b9df'); g.addColorStop(1, '#4aa3cf');
  x.fillStyle = g; x.fillRect(0, 0, TS, TS);
  x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) { const yy = 8 + r() * 48, xx = r() * TS; x.beginPath(); x.moveTo(xx, yy); x.quadraticCurveTo(xx + 6, yy - 3, xx + 12, yy); x.stroke(); }
  if (kind !== 'mid') {
    // margem: grama → areia molhada → espuma
    x.save(); if (kind === 'bot') { x.translate(0, TS); x.scale(1, -1); }
    x.fillStyle = '#e3cd93'; x.beginPath(); x.moveTo(0, 0); x.lineTo(TS, 0); x.lineTo(TS, 16);
    for (let xx = TS; xx >= 0; xx -= 8) x.lineTo(xx, 16 + Math.sin(xx / 9 + seed) * 2.5);
    x.closePath(); x.fill();
    x.fillStyle = '#c9b072'; x.fillRect(0, 0, TS, 3);
    x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 2.4; x.beginPath();
    for (let xx = 0; xx <= TS; xx += 4) { const yy = 18 + Math.sin(xx / 9 + seed) * 2.5; if (xx) x.lineTo(xx, yy); else x.moveTo(xx, yy); }
    x.stroke();
    x.restore();
  }
}

function blendTile(x: Ctx, biome: Biome, dir: number) {
  // borda suave da cor do bioma vizinho: gradiente sem aresta dura, com tufos que avançam um pouco
  x.save(); x.translate(TS / 2, TS / 2); x.rotate((dir * Math.PI) / 2); x.translate(-TS / 2, -TS / 2);
  const g = x.createLinearGradient(0, 0, 0, 30);
  const n = parseInt(BASE[biome].slice(1), 16), rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  g.addColorStop(0, `rgba(${rgb},.9)`); g.addColorStop(0.5, `rgba(${rgb},.4)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, TS, 30);
  const r = mulberry(dir * 13 + BIOMES.indexOf(biome));
  for (let i = 0; i < 5; i++) { ell(x, 6 + i * 13 + r() * 4, 6 + r() * 8, 6 + r() * 3, 4 + r() * 3); x.fillStyle = `rgba(${rgb},.55)`; x.fill(); }
  x.restore();
}

/** Tileset completo com extrusão de 2 px em cada célula. */
export function buildTileset(): HTMLCanvasElement {
  const rows = Math.ceil(COUNT / COLS);
  const { c, x } = cv(COLS * CELL, rows * CELL);
  const put = (i: number, draw: (t: Ctx) => void) => {
    const { c: t, x: tx } = cv(TS, TS);
    draw(tx);
    const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
    // extrusão: estica as bordas para a margem
    x.drawImage(t, 0, 0, TS, 1, cx + PAD, cy, TS, PAD);
    x.drawImage(t, 0, TS - 1, TS, 1, cx + PAD, cy + PAD + TS, TS, PAD);
    x.drawImage(t, 0, 0, 1, TS, cx, cy + PAD, PAD, TS);
    x.drawImage(t, TS - 1, 0, 1, TS, cx + PAD + TS, cy + PAD, PAD, TS);
    x.drawImage(t, cx + PAD === cx + PAD ? 0 : 0, 0, 1, 1, cx, cy, PAD, PAD);
    x.drawImage(t, cx + PAD, cy + PAD);
  };
  BIOMES.forEach((b, bi) => { for (let v = 0; v < VARIANTS; v++) put(IDX.grass(bi, v), (t) => grassTile(t, b, 100 + bi * 17 + v * 5)); });
  for (let m = 0; m < 16; m++) put(IDX.path(m), (t) => pathTile(t, m, 300 + m));
  put(IDX.waterTop, (t) => waterTile(t, 'top', 7)); put(IDX.waterMid, (t) => waterTile(t, 'mid', 9)); put(IDX.waterBot, (t) => waterTile(t, 'bot', 11));
  BIOMES.forEach((b, bi) => { for (let d = 0; d < 4; d++) put(IDX.blend(bi, d), (t) => blendTile(t, b, d)); });
  return c;
}

const biomeAt = (tx: number, ty: number): number => {
  const r = regionAt(tx, ty);
  return BIOMES.indexOf((r ?? 'border') as Biome);
};

/** Dados das três camadas (índice -1 = vazio). */
export function terrainLayers() {
  const r = mulberry(2026);
  const ground: number[][] = [], blend: number[][] = [], over: number[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    ground.push([]); blend.push([]); over.push([]);
    for (let x = 0; x < MAP_W; x++) {
      const b = biomeAt(x, y);
      ground[y].push(IDX.grass(b, Math.floor(r() * VARIANTS)));
      // mescla com o primeiro vizinho de bioma diferente (N, L, S, O)
      let bl = -1;
      ([[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]] as const).some(([dx, dy, d]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) return false;
        const nb = biomeAt(nx, ny);
        if (nb !== b) { bl = IDX.blend(nb, d); return true; }
        return false;
      });
      blend[y].push(bl);
      let ov = -1;
      if (isWater(x, y) || (y >= RIVER.y0 && y <= RIVER.y1)) ov = y === RIVER.y0 ? IDX.waterTop : y === RIVER.y1 ? IDX.waterBot : IDX.waterMid;
      else if (PATH_TILES.has(`${x},${y}`) && regionAt(x, y)) {
        const has = (dx: number, dy: number) => PATH_TILES.has(`${x + dx},${y + dy}`) || (dy !== 0 && y + dy >= RIVER.y0 && y + dy <= RIVER.y1 && !isWater(x, y + dy));
        ov = IDX.path((has(0, -1) ? 1 : 0) | (has(1, 0) ? 2 : 0) | (has(0, 1) ? 4 : 0) | (has(-1, 0) ? 8 : 0));
      }
      over[y].push(ov);
    }
  }
  return { ground, blend, over };
}
