// Pincéis da direção de arte cartoon: luz do topo-esquerda, contorno marrom quente,
// volume por gradiente e sombras suaves para baixo-direita (ver docs/ART_BIBLE.md).
import { shade } from '../draw.ts';

export type Ctx = CanvasRenderingContext2D;
export const OUT = '#4a3423';
export const LW = 2.4;

export function cv(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  const x = c.getContext('2d')!;
  x.lineJoin = 'round'; x.lineCap = 'round';
  return { c, x };
}

/** Gradiente de volume: realce no topo-esquerda, sombra na base-direita. */
export function vol(x: Ctx, x0: number, y0: number, x1: number, y1: number, base: string, light = 0.2, dark = -0.24) {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, shade(base, light));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, dark));
  return g;
}

/** Gradiente radial de esfera (frutas, copas, pedras). */
export function sphere(x: Ctx, cx: number, cy: number, r: number, base: string) {
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
  g.addColorStop(0, shade(base, 0.28));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.28));
  return g;
}

export function fillOut(x: Ctx, fill: string | CanvasGradient, lw = LW, stroke = OUT) {
  x.fillStyle = fill; x.fill();
  if (lw > 0) { x.lineWidth = lw; x.strokeStyle = stroke; x.stroke(); }
}

export function ell(x: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0) {
  x.beginPath(); x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

export function rr(x: Ctx, X: number, Y: number, w: number, h: number, r: number | number[]) {
  x.beginPath(); x.roundRect(X, Y, w, h, r);
}

/** Sombra de contato suave, deslocada para baixo-direita. */
export function shadow(x: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.28) {
  const g = x.createRadialGradient(cx + rx * 0.12, cy, 0, cx + rx * 0.12, cy, rx);
  g.addColorStop(0, `rgba(34,52,24,${a})`);
  g.addColorStop(0.7, `rgba(34,52,24,${a * 0.6})`);
  g.addColorStop(1, 'rgba(34,52,24,0)');
  x.save(); x.translate(cx + rx * 0.12, cy); x.scale(1, ry / rx); x.translate(-(cx + rx * 0.12), -cy);
  x.beginPath(); x.arc(cx + rx * 0.12, cy, rx, 0, Math.PI * 2); x.fillStyle = g; x.fill();
  x.restore();
}

/** Brilho especular. */
export function shine(x: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.4, rot = -0.5) {
  ell(x, cx, cy, rx, ry, rot); x.fillStyle = `rgba(255,255,255,${a})`; x.fill();
}

/** Caminho orgânico (bolha de n lóbulos). */
export function blobPath(x: Ctx, cx: number, cy: number, r: number, lobes: number, wob: number, rnd: () => number, sy = 1) {
  const pts: [number, number][] = [];
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + rnd() * 0.3;
    const rr2 = r * (1 - wob / 2 + rnd() * wob);
    pts.push([cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2 * sy]);
  }
  x.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    // empurra o ponto de controle para fora: borda em "nuvem"
    const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy) || 1;
    const k = r * 0.32;
    if (i === 0) x.moveTo(p[0], p[1]);
    x.quadraticCurveTo(mx + (dx / d) * k, my + (dy / d) * k * sy, q[0], q[1]);
  }
  x.closePath();
}

/**
 * Desenha várias formas com UM contorno externo: primeiro o traço grosso de todas,
 * depois o preenchimento por cima (esconde os traços internos).
 */
export function cluster(x: Ctx, paths: (() => void)[], fills: (string | CanvasGradient)[], lw = LW) {
  x.lineWidth = lw * 2; x.strokeStyle = OUT;
  for (const p of paths) { p(); x.stroke(); }
  paths.forEach((p, i) => { p(); x.fillStyle = fills[i] ?? fills[fills.length - 1]; x.fill(); });
}

export { shade };
