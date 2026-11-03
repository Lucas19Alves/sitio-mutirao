// Peças de cenário (ponte, cerca) e texturas de efeito/ambiente (partículas, nuvem, pássaro,
// borboleta, galinha). Tudo pintado a 2× como o resto da arte.
import { cv, ell, fillOut, rr, shadow, shine, sphere, vol, shade, OUT, type Ctx } from './paint.ts';
import type { Art } from './nature.ts';

const art = (w: number, h: number, ox: number, oy: number, draw: (x: Ctx) => void): Art => { const { c, x } = cv(w, h); draw(x); return { c, ox, oy }; };

/** Ponte de tábuas: 2 tiles de largura × (tiles de rio + 1) de comprimento. Origem no canto sup.-esq. */
export function bridgeArt(wTiles: number, hTiles: number): Art {
  const W = wTiles * 64, H = hTiles * 64, M = 14;
  return art(W + M * 2, H + M * 2, M / (W + M * 2), M / (H + M * 2), (x) => {
    shadow(x, M + W / 2 + 6, M + H / 2 + 10, W * 0.7, H * 0.55, 0.3);
    rr(x, M + 4, M, W - 8, H, 8); fillOut(x, '#6b4426', 2.4);
    for (let y = 0; y < H; y += 16) {
      const k = (y / 16) % 3;
      rr(x, M + 2, M + y + 1, W - 4, 14, 4); fillOut(x, vol(x, M, M + y, M + W, M + y + 14, shade('#b9824e', (k - 1) * 0.06), 0.18, -0.2), 1.6);
      x.fillStyle = 'rgba(60,35,15,.5)'; ell(x, M + 10, M + y + 8, 1.4, 1.4); x.fill(); ell(x, M + W - 10, M + y + 8, 1.4, 1.4); x.fill();
    }
    for (const sx of [M - 4, M + W - 6]) {
      rr(x, sx, M - 6, 10, H + 12, 4); fillOut(x, vol(x, sx, 0, sx + 10, 0, '#9c6a3c'), 2);
      for (let y = 0; y <= H; y += H / Math.max(2, hTiles)) { rr(x, sx - 2, M + y - 10, 14, 14, 4); fillOut(x, vol(x, sx - 2, M + y - 10, sx + 12, M + y + 4, '#8d5a33'), 1.8); }
    }
  });
}

/** Cerca do campo: segmento horizontal (1 tile) e poste. */
export function fenceArts(): Record<string, Art> {
  const post = (x: Ctx, px: number, base: number) => { rr(x, px - 5, base - 34, 10, 34, 3); fillOut(x, vol(x, px - 5, base - 34, px + 5, base, '#c79359'), 2); ell(x, px, base - 33, 5, 2.4); x.fillStyle = '#e2b27a'; x.fill(); };
  return {
    fence_h: art(64, 48, 0, 40 / 48, (x) => {
      shadow(x, 34, 42, 30, 4, 0.22);
      for (const y of [16, 28]) { rr(x, 0, y, 64, 7, 3); fillOut(x, vol(x, 0, y, 0, y + 7, '#d3a265'), 1.8); }
      post(x, 6, 42);
    }),
    fence_v: art(24, 76, 0.5, 70 / 76, (x) => {
      shadow(x, 12, 70, 9, 4, 0.22);
      rr(x, 7, 6, 10, 64, 3); fillOut(x, vol(x, 7, 0, 17, 0, '#d3a265'), 1.8);
      post(x, 12, 40); post(x, 12, 72);
    }),
    fence_post: art(24, 48, 0.5, 42 / 48, (x) => { shadow(x, 12, 42, 9, 4, 0.22); post(x, 12, 42); }),
  };
}

/** Texturas de efeito. Chaves usadas pela cena com prefixo fx_. */
export function fxArts(): Record<string, Art> {
  const c = (w: number, h: number, d: (x: Ctx) => void) => art(w, h, 0.5, 0.5, d);
  return {
    dot: c(16, 16, (x) => { ell(x, 8, 8, 7, 7); x.fillStyle = '#fff'; x.fill(); }),
    puff: c(48, 48, (x) => { const g = x.createRadialGradient(20, 20, 2, 24, 24, 22); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.6, 'rgba(240,240,236,.75)'); g.addColorStop(1, 'rgba(230,230,226,0)'); ell(x, 24, 24, 22, 22); x.fillStyle = g; x.fill(); }),
    dust: c(40, 40, (x) => { const g = x.createRadialGradient(20, 20, 2, 20, 20, 18); g.addColorStop(0, 'rgba(226,196,150,.9)'); g.addColorStop(1, 'rgba(226,196,150,0)'); ell(x, 20, 20, 18, 18); x.fillStyle = g; x.fill(); }),
    leaf: c(24, 16, (x) => { x.beginPath(); x.moveTo(3, 8); x.quadraticCurveTo(12, -1, 21, 8); x.quadraticCurveTo(12, 17, 3, 8); fillOut(x, vol(x, 3, 2, 21, 14, '#79b84a'), 1.4); x.beginPath(); x.moveTo(5, 8); x.lineTo(19, 8); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1; x.stroke(); }),
    chip: c(18, 14, (x) => { x.beginPath(); x.moveTo(2, 4); x.lineTo(14, 2); x.lineTo(16, 10); x.lineTo(4, 12); x.closePath(); fillOut(x, vol(x, 2, 2, 16, 12, '#d9a766'), 1.4); }),
    stone: c(16, 14, (x) => { x.beginPath(); x.moveTo(3, 9); x.lineTo(6, 2); x.lineTo(13, 3); x.lineTo(14, 10); x.lineTo(7, 13); x.closePath(); fillOut(x, vol(x, 3, 2, 14, 13, '#a7adb2'), 1.4); }),
    grassbit: c(14, 18, (x) => { x.beginPath(); x.moveTo(7, 17); x.quadraticCurveTo(3, 9, 6, 1); x.quadraticCurveTo(10, 9, 7, 17); fillOut(x, '#8fcf4a', 1.2, shade('#8fcf4a', -0.5)); }),
    sparkle: c(32, 32, (x) => { x.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 5 : 14; x.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r); } x.closePath(); fillOut(x, '#fff6c4', 1.6, '#e0a21c'); }),
    coin: c(28, 28, (x) => { ell(x, 14, 14, 11, 11); fillOut(x, sphere(x, 14, 14, 11, '#f6c445'), 2); ell(x, 14, 14, 6.5, 6.5); x.strokeStyle = 'rgba(160,100,10,.55)'; x.lineWidth = 1.6; x.stroke(); shine(x, 10, 9, 3, 2, 0.6); }),
    heart: c(28, 26, (x) => { x.beginPath(); x.moveTo(14, 23); x.bezierCurveTo(1, 14, 3, 3, 10, 4); x.quadraticCurveTo(13, 5, 14, 9); x.quadraticCurveTo(15, 5, 18, 4); x.bezierCurveTo(25, 3, 27, 14, 14, 23); fillOut(x, sphere(x, 14, 12, 12, '#ef5b6e'), 1.8); }),
    ring: c(96, 48, (x) => { ell(x, 48, 24, 42, 18); x.lineWidth = 5; x.strokeStyle = 'rgba(255,253,246,.95)'; x.stroke(); ell(x, 48, 24, 42, 18); x.lineWidth = 2; x.strokeStyle = 'rgba(246,196,69,.9)'; x.stroke(); }),
    target: c(80, 40, (x) => { ell(x, 40, 20, 30, 13); x.fillStyle = 'rgba(255,253,246,.25)'; x.fill(); x.lineWidth = 3; x.strokeStyle = 'rgba(255,253,246,.9)'; x.setLineDash([8, 6]); x.stroke(); }),
    arrow: c(36, 40, (x) => { x.beginPath(); x.moveTo(8, 4); x.lineTo(28, 4); x.lineTo(28, 16); x.lineTo(34, 16); x.lineTo(18, 36); x.lineTo(2, 16); x.lineTo(8, 16); x.closePath(); fillOut(x, vol(x, 2, 4, 34, 36, '#f6c445', 0.3, -0.15), 2.4); }),
    cloud: c(512, 256, (x) => { for (const [cx, cy, r] of [[180, 130, 110], [300, 110, 120], [360, 150, 90], [230, 160, 90]]) { const g = x.createRadialGradient(cx, cy, 5, cx, cy, r); g.addColorStop(0, 'rgba(20,40,30,.55)'); g.addColorStop(1, 'rgba(20,40,30,0)'); ell(x, cx, cy, r, r * 0.7); x.fillStyle = g; x.fill(); } }),
    ripple: art(128, 64, 0, 0, (x) => { x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2.4; for (const [cx, cy, w] of [[20, 14, 18], [84, 30, 22], [44, 50, 16], [112, 56, 12]]) { x.beginPath(); x.moveTo(cx - w, cy); x.quadraticCurveTo(cx - w / 2, cy - 4, cx, cy); x.quadraticCurveTo(cx + w / 2, cy + 4, cx + w, cy); x.stroke(); } }),
    glint: c(20, 20, (x) => { x.beginPath(); x.moveTo(10, 1); x.lineTo(12, 8); x.lineTo(19, 10); x.lineTo(12, 12); x.lineTo(10, 19); x.lineTo(8, 12); x.lineTo(1, 10); x.lineTo(8, 8); x.closePath(); x.fillStyle = 'rgba(255,255,255,.95)'; x.fill(); }),
  };
}

/** Animais e bichinhos do ambiente: quadros de animação como artes separadas. */
export function critterArts(): Record<string, Art> {
  const out: Record<string, Art> = {};
  // pássaro (2 quadros: asas para cima/baixo), visto de cima
  for (const f of [0, 1]) out[`bird_${f}`] = art(44, 30, 0.5, 0.5, (x) => {
    const wy = f ? 4 : -6;
    x.beginPath(); x.moveTo(22, 16); x.quadraticCurveTo(12, wy + 10, 2, wy + 14); x.quadraticCurveTo(12, 14, 22, 20); x.quadraticCurveTo(32, 14, 42, wy + 14); x.quadraticCurveTo(32, wy + 10, 22, 16);
    fillOut(x, '#3f4b5c', 1.4, '#232a33');
    ell(x, 22, 17, 3.4, 5); fillOut(x, '#4f5d70', 1.2, '#232a33');
  });
  // borboleta (2 quadros)
  for (const f of [0, 1]) for (const [name, col] of [['bfy', '#f6c445'], ['bfp', '#f29bc0'], ['bfb', '#7fc6ee']] as const) out[`${name}_${f}`] = art(30, 26, 0.5, 0.5, (x) => {
    const s = f ? 0.45 : 1;
    for (const sg of [-1, 1]) { ell(x, 15 + sg * 6 * s, 10, 6 * s, 7); fillOut(x, col, 1.3); ell(x, 15 + sg * 4.5 * s, 18, 4 * s, 4.6); fillOut(x, shade(col, -0.12), 1.2); }
    rr(x, 13.6, 6, 2.8, 16, 1.4); x.fillStyle = OUT; x.fill();
  });
  // galinha (ciscando: 3 quadros) de lado, olhando para a esquerda
  for (const f of [0, 1, 2]) out[`hen_${f}`] = art(56, 56, 0.5, 0.9, (x) => {
    shadow(x, 28, 50, 15, 4, 0.28);
    const peck = f === 2;
    x.strokeStyle = '#e0a21c'; x.lineWidth = 2.6;
    for (const lx of [24, 32]) { x.beginPath(); x.moveTo(lx, 40); x.lineTo(lx + (f === 1 && lx === 24 ? -3 : 0), 49); x.stroke(); }
    ell(x, 30, 32, 15, 12); fillOut(x, sphere(x, 30, 32, 15, '#fbf8ef'), 2);
    x.beginPath(); x.moveTo(42, 28); x.quadraticCurveTo(52, 18, 48, 32); x.closePath(); fillOut(x, '#efe8d6', 1.8);
    ell(x, 33, 34, 7, 5, 0.3); fillOut(x, '#ece4d0', 1.4);
    const hx = peck ? 16 : 18, hy = peck ? 34 : 20;
    ell(x, hx, hy, 8, 8); fillOut(x, sphere(x, hx, hy, 8, '#fbf8ef'), 2);
    x.beginPath(); x.moveTo(hx - 7, hy); x.lineTo(hx - 13, hy + 2); x.lineTo(hx - 7, hy + 4); x.closePath(); fillOut(x, '#f2a62c', 1.3);
    for (const [cx, cy] of [[hx - 2, hy - 8], [hx + 2, hy - 9], [hx + 5, hy - 7]]) { ell(x, cx, cy, 2.6, 3); fillOut(x, '#e2473e', 1.1); }
    ell(x, hx - 5, hy + 6, 2, 3); fillOut(x, '#e2473e', 1);
    ell(x, hx - 2, hy - 1, 1.4, 1.6); x.fillStyle = '#2b1d14'; x.fill();
  });
  return out;
}
