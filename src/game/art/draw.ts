// Primitivas de desenho em Canvas 2D usadas por toda a arte procedural.
export const INK = '#3a2a1f';

export function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return { c, ctx };
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Clareia (amt > 0) ou escurece (amt < 0) uma cor hex. */
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (x: number) => clamp(amt >= 0 ? x + (255 - x) * amt : x * (1 + amt));
  return `#${((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1)}`;
}

export function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Preenche e contorna o caminho atual. */
export function fs(ctx: CanvasRenderingContext2D, fill: string, lw = 2, stroke = INK) {
  ctx.fillStyle = fill; ctx.fill();
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

export function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}

export function poly(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

/** Sombra elíptica suave no chão. */
export function groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.22) {
  ellipse(ctx, x, y, rx, ry);
  ctx.fillStyle = `rgba(30,40,20,${a})`; ctx.fill();
}

/** Brilho de "luz de cima à esquerda" sobre uma forma já traçada. */
export function gloss(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.35) {
  ellipse(ctx, x, y, rx, ry, -0.5);
  ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
}

export function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
