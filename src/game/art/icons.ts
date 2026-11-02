// Ícones de itens desenhados em um espaço 64x64. Usados no Phaser (texturas)
// e no React (data URLs em cache).
import { ITEM_BY_ID, type IconSpec } from '../../data/items.ts';
import { canvas, ellipse, fs, gloss, poly, rrect, shade, INK } from './draw.ts';

type Ctx = CanvasRenderingContext2D;
type Painter = (x: Ctx, c: string, c2: string) => void;

const leaf = (x: Ctx, cx: number, cy: number, rx: number, ry: number, rot: number, col: string) => { ellipse(x, cx, cy, rx, ry, rot); fs(x, col, 2); };

const P: Record<string, Painter> = {
  log(x, c, c2) {
    x.save(); x.translate(32, 34); x.rotate(-0.35);
    rrect(x, -22, -11, 40, 22, 10); fs(x, c, 2.5);
    ellipse(x, 18, 0, 8, 11); fs(x, c2, 2.5);
    ellipse(x, 18, 0, 4, 6); x.strokeStyle = shade(c, -0.2); x.lineWidth = 1.5; x.stroke();
    x.strokeStyle = shade(c, -0.3); x.beginPath(); x.moveTo(-14, -4); x.lineTo(6, -4); x.moveTo(-10, 4); x.lineTo(8, 4); x.stroke();
    x.restore();
  },
  fiber(x, c, c2) {
    for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(32 + i * 2, 54); x.quadraticCurveTo(32 + i * 6, 30, 32 + i * 9, 10 + Math.abs(i) * 3); x.lineWidth = 4; x.strokeStyle = INK; x.stroke(); x.lineWidth = 2.5; x.strokeStyle = i % 2 ? c : c2; x.stroke(); }
    rrect(x, 22, 40, 20, 7, 3); fs(x, '#c8a46e', 2);
  },
  stone(x, c, c2) {
    poly(x, [12, 44, 16, 24, 30, 14, 46, 18, 54, 34, 48, 50, 24, 54]); fs(x, c, 2.5);
    poly(x, [30, 14, 46, 18, 40, 30, 26, 26]); x.fillStyle = shade(c, 0.25); x.fill();
    x.strokeStyle = c2; x.lineWidth = 1.5; x.beginPath(); x.moveTo(26, 34); x.lineTo(36, 40); x.stroke();
  },
  leaf(x, c, c2) {
    leaf(x, 24, 34, 10, 20, -0.5, c); leaf(x, 40, 32, 10, 20, 0.5, c2); leaf(x, 32, 24, 9, 18, 0, shade(c, 0.15));
  },
  mushroom(x, c, c2) {
    rrect(x, 26, 30, 12, 22, 5); fs(x, c2, 2.5);
    x.beginPath(); x.ellipse(32, 30, 22, 16, 0, Math.PI, 0); x.closePath(); fs(x, c, 2.5);
    for (const [a, b] of [[24, 22], [38, 20], [32, 27]]) { ellipse(x, a, b, 3.5, 2.5); x.fillStyle = '#fff'; x.fill(); }
  },
  blob(x, c, c2) {
    ellipse(x, 32, 38, 22, 14); fs(x, c, 2.5); ellipse(x, 28, 30, 13, 9); fs(x, shade(c, 0.12), 2); gloss(x, 24, 27, 5, 3, 0.3);
    x.strokeStyle = c2; x.lineWidth = 1.5; x.beginPath(); x.arc(38, 42, 4, 0, 3); x.stroke();
  },
  pile(x, c, c2) {
    x.beginPath(); x.moveTo(8, 50); x.quadraticCurveTo(32, 6, 56, 50); x.closePath(); fs(x, c, 2.5);
    for (let i = 0; i < 12; i++) { x.fillStyle = c2; x.fillRect(16 + (i * 7) % 30, 30 + (i * 5) % 16, 2, 2); }
  },
  ore(x, c, c2) {
    poly(x, [10, 44, 14, 22, 30, 12, 48, 16, 56, 36, 46, 52, 22, 54]); fs(x, c2, 2.5);
    for (const [a, b, r] of [[26, 28, 7], [40, 34, 6], [30, 44, 5]]) { poly(x, [a - r, b, a, b - r, a + r, b, a, b + r]); fs(x, c, 1.5); gloss(x, a - 2, b - 2, 2, 1.5, 0.5); }
  },
  petals(x, c, c2) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; leaf(x, 32 + Math.cos(a) * 12, 32 + Math.sin(a) * 12, 7, 11, a + Math.PI / 2, i % 2 ? c : c2); }
    ellipse(x, 32, 32, 6, 6); fs(x, '#ffd54f', 2);
  },
  crystal(x, c, c2) {
    poly(x, [20, 54, 14, 30, 24, 10, 32, 30]); fs(x, c, 2.5);
    poly(x, [30, 56, 26, 22, 38, 6, 48, 24, 44, 56]); fs(x, c2, 2.5);
    poly(x, [42, 56, 46, 34, 56, 40, 52, 56]); fs(x, c, 2);
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(36, 16); x.lineTo(32, 40); x.stroke();
  },
  fruit(x, c, c2) {
    ellipse(x, 32, 36, 19, 18); fs(x, c, 2.5); gloss(x, 24, 28, 6, 4);
    x.beginPath(); x.moveTo(32, 20); x.lineTo(33, 10); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    leaf(x, 40, 14, 8, 4, -0.4, c2);
  },
  grain(x, c, c2) {
    for (const dx of [-8, 0, 8]) {
      x.beginPath(); x.moveTo(32 + dx / 2, 58); x.lineTo(32 + dx, 22); x.lineWidth = 2.5; x.strokeStyle = c2; x.stroke();
      for (let k = 0; k < 5; k++) { leaf(x, 32 + dx - 3, 14 + k * 6, 3, 5, -0.5, c); leaf(x, 32 + dx + 3, 14 + k * 6, 3, 5, 0.5, c); }
    }
  },
  root(x, c, c2) {
    x.save(); x.translate(32, 36); x.rotate(0.5);
    x.beginPath(); x.moveTo(-9, -16); x.quadraticCurveTo(0, -22, 9, -16); x.lineTo(1, 22); x.lineTo(-1, 22); x.closePath(); fs(x, c, 2.5);
    x.strokeStyle = shade(c, -0.25); x.lineWidth = 1.5; for (const y of [-6, 2, 10]) { x.beginPath(); x.moveTo(-5, y); x.lineTo(1, y + 1); x.stroke(); }
    leaf(x, -6, -24, 4, 9, -0.4, c2); leaf(x, 4, -25, 4, 9, 0.4, c2); leaf(x, 0, -27, 3, 9, 0, shade(c2, 0.15));
    x.restore();
  },
  corn(x, c, c2) {
    ellipse(x, 32, 32, 11, 22); fs(x, c, 2.5);
    x.fillStyle = shade(c, -0.15); for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) x.fillRect(25 + i * 4, 15 + j * 5, 2, 2);
    leaf(x, 22, 40, 6, 18, 0.3, c2); leaf(x, 42, 40, 6, 18, -0.3, c2);
  },
  potato(x, c, c2) {
    ellipse(x, 30, 36, 20, 15, 0.3); fs(x, c, 2.5); ellipse(x, 42, 26, 10, 8); fs(x, c, 2.5);
    x.fillStyle = c2; for (const [a, b] of [[24, 34], [34, 42], [42, 26], [22, 42]]) { ellipse(x, a, b, 1.6, 1.2); x.fill(); }
  },
  cotton(x, c, c2) {
    x.beginPath(); x.moveTo(32, 58); x.lineTo(32, 40); x.lineWidth = 3; x.strokeStyle = c2; x.stroke();
    for (const [a, b] of [[24, 30], [40, 30], [32, 22], [32, 34]]) { ellipse(x, a, b, 11, 10); fs(x, c, 2.5); }
    leaf(x, 22, 42, 8, 4, 0.5, '#6d4c41'); leaf(x, 42, 42, 8, 4, -0.5, '#6d4c41');
  },
  berry(x, c, c2) {
    x.beginPath(); x.moveTo(32, 56); x.bezierCurveTo(10, 40, 12, 18, 32, 18); x.bezierCurveTo(52, 18, 54, 40, 32, 56); fs(x, c, 2.5);
    x.fillStyle = '#fff59d'; for (let i = 0; i < 9; i++) { ellipse(x, 24 + (i % 3) * 8, 26 + Math.floor(i / 3) * 8, 1.4, 2); x.fill(); }
    leaf(x, 26, 16, 7, 4, -0.3, c2); leaf(x, 38, 16, 7, 4, 0.3, c2);
  },
  flower(x, c, c2) {
    x.beginPath(); x.moveTo(32, 60); x.lineTo(32, 34); x.lineWidth = 3.5; x.strokeStyle = '#558b2f'; x.stroke();
    leaf(x, 24, 48, 8, 4, 0.4, '#7cb342');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; leaf(x, 32 + Math.cos(a) * 11, 24 + Math.sin(a) * 11, 5, 9, a + Math.PI / 2, c); }
    ellipse(x, 32, 24, 7, 7); fs(x, c2, 2);
  },
  grape(x, c, c2) {
    for (const [a, b] of [[24, 26], [34, 26], [44, 26], [29, 35], [39, 35], [34, 44], [24, 35], [44, 35]]) { ellipse(x, a, b, 6, 6); fs(x, c, 2); gloss(x, a - 2, b - 2, 2, 1.5, 0.4); }
    leaf(x, 40, 14, 10, 6, -0.3, c2);
  },
  tulip(x, c, c2) {
    x.beginPath(); x.moveTo(32, 60); x.lineTo(32, 32); x.lineWidth = 3.5; x.strokeStyle = c2; x.stroke(); leaf(x, 40, 46, 5, 12, 0.5, c2);
    x.beginPath(); x.moveTo(20, 14); x.lineTo(26, 22); x.lineTo(32, 12); x.lineTo(38, 22); x.lineTo(44, 14); x.quadraticCurveTo(46, 36, 32, 36); x.quadraticCurveTo(18, 36, 20, 14); fs(x, c, 2.5);
  },
  lavender(x, c, c2) {
    for (const dx of [-8, 0, 8]) {
      x.beginPath(); x.moveTo(32, 60); x.lineTo(32 + dx, 26); x.lineWidth = 2.5; x.strokeStyle = '#558b2f'; x.stroke();
      for (let k = 0; k < 5; k++) { ellipse(x, 32 + dx, 10 + k * 5, 3.5, 3); fs(x, k % 2 ? c : c2, 1.2); }
    }
  },
  pumpkin(x, c, c2) {
    for (const [a, r] of [[20, 13], [44, 13], [32, 15]]) { ellipse(x, a, 38, r, 16); fs(x, c, 2.5); }
    gloss(x, 28, 30, 4, 3); rrect(x, 29, 14, 6, 10, 2); fs(x, c2, 2);
  },
  rope(x, c, c2) {
    for (const r of [20, 14, 8]) { ellipse(x, 32, 34, r, r * 0.8); x.lineWidth = 6; x.strokeStyle = INK; x.stroke(); x.lineWidth = 4; x.strokeStyle = r === 14 ? c2 : c; x.stroke(); }
  },
  basket(x, c, c2) {
    x.beginPath(); x.arc(32, 30, 16, Math.PI, 0); x.lineWidth = 5; x.strokeStyle = INK; x.stroke(); x.lineWidth = 3; x.strokeStyle = c2; x.stroke();
    poly(x, [10, 30, 54, 30, 48, 54, 16, 54]); fs(x, c, 2.5);
    x.strokeStyle = c2; x.lineWidth = 1.5; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(13 + i, 36 + i * 5); x.lineTo(51 - i, 36 + i * 5); x.stroke(); }
  },
  plank(x, c, c2) {
    for (const dy of [0, 12]) { x.save(); x.translate(32, 26 + dy); x.rotate(-0.2); rrect(x, -24, -6, 48, 12, 2); fs(x, dy ? c : shade(c, 0.1), 2.5); x.strokeStyle = c2; x.lineWidth = 1; x.beginPath(); x.moveTo(-18, 0); x.lineTo(14, 0); x.stroke(); x.restore(); }
  },
  beam(x, c, c2) {
    x.save(); x.translate(32, 32); x.rotate(-0.6); rrect(x, -26, -8, 52, 16, 2); fs(x, c, 2.5);
    x.fillStyle = c2; x.fillRect(-26, 3, 52, 4); x.strokeStyle = INK; x.lineWidth = 2.5; x.strokeRect(-26, -8, 52, 16); x.restore();
  },
  sack(x, c, c2) {
    x.beginPath(); x.moveTo(20, 20); x.quadraticCurveTo(8, 56, 32, 56); x.quadraticCurveTo(56, 56, 44, 20); x.closePath(); fs(x, c, 2.5);
    x.beginPath(); x.moveTo(22, 20); x.lineTo(26, 10); x.lineTo(38, 10); x.lineTo(42, 20); fs(x, c, 2.5);
    rrect(x, 22, 17, 20, 5, 2); fs(x, c2, 2);
    ellipse(x, 32, 40, 7, 6); x.fillStyle = shade(c2, 0.2); x.fill();
  },
  bread(x, c, c2) {
    x.beginPath(); x.moveTo(8, 44); x.quadraticCurveTo(10, 18, 32, 18); x.quadraticCurveTo(54, 18, 56, 44); x.closePath(); fs(x, c, 2.5);
    x.strokeStyle = c2; x.lineWidth = 3; for (const a of [20, 32, 44]) { x.beginPath(); x.moveTo(a - 4, 28); x.lineTo(a + 3, 24); x.stroke(); }
  },
  cake(x, c, c2) {
    rrect(x, 12, 30, 40, 22, 4); fs(x, c2, 2.5);
    x.beginPath(); x.moveTo(12, 34); x.quadraticCurveTo(12, 22, 32, 22); x.quadraticCurveTo(52, 22, 52, 34); x.quadraticCurveTo(46, 40, 40, 34); x.quadraticCurveTo(32, 40, 24, 34); x.quadraticCurveTo(18, 40, 12, 34); fs(x, c, 2.5);
    ellipse(x, 32, 18, 4, 4); fs(x, '#e53935', 2);
  },
  pie(x, c, c2) {
    ellipse(x, 32, 40, 24, 12); fs(x, c, 2.5); ellipse(x, 32, 36, 20, 9); fs(x, c2, 2);
    x.strokeStyle = shade(c, 0.2); x.lineWidth = 3; for (const a of [-10, 0, 10]) { x.beginPath(); x.moveTo(32 + a - 6, 30); x.lineTo(32 + a + 6, 42); x.stroke(); }
  },
  bottle(x, c, c2) {
    x.beginPath(); x.moveTo(26, 8); x.lineTo(38, 8); x.lineTo(38, 20); x.quadraticCurveTo(48, 24, 48, 34); x.lineTo(48, 54); x.quadraticCurveTo(48, 58, 44, 58); x.lineTo(20, 58); x.quadraticCurveTo(16, 58, 16, 54); x.lineTo(16, 34); x.quadraticCurveTo(16, 24, 26, 20); x.closePath(); fs(x, c2, 2.5);
    rrect(x, 18, 32, 28, 24, 3); x.fillStyle = c; x.fill(); rrect(x, 24, 4, 16, 6, 2); fs(x, '#8d6e63', 2); gloss(x, 22, 30, 3, 6, 0.5);
  },
  jar(x, c, c2) {
    rrect(x, 14, 18, 36, 38, 9); fs(x, c2, 2.5); rrect(x, 16, 28, 32, 26, 7); x.fillStyle = c; x.fill();
    rrect(x, 16, 10, 32, 10, 3); fs(x, '#c62828', 2); rrect(x, 22, 34, 20, 10, 2); fs(x, '#fff8e1', 1.5); gloss(x, 22, 26, 3, 6, 0.5);
  },
  bowl(x, c, c2) {
    ellipse(x, 32, 30, 24, 8); fs(x, c, 2.5);
    x.beginPath(); x.moveTo(8, 30); x.quadraticCurveTo(10, 56, 32, 56); x.quadraticCurveTo(54, 56, 56, 30); fs(x, '#fafafa', 2.5);
    x.strokeStyle = '#1d3b72'; x.lineWidth = 2; x.beginPath(); x.moveTo(12, 40); x.quadraticCurveTo(32, 48, 52, 40); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.7)'; for (const a of [24, 34]) { x.beginPath(); x.moveTo(a, 20); x.quadraticCurveTo(a + 4, 14, a, 8); x.stroke(); }
    ellipse(x, 28, 30, 4, 2); x.fillStyle = c2; x.fill();
  },
  cup(x, c, c2) {
    rrect(x, 14, 22, 30, 30, 6); fs(x, c2, 2.5); x.beginPath(); x.arc(46, 36, 7, -1.4, 1.4); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
    ellipse(x, 29, 24, 13, 4); fs(x, c, 2); leaf(x, 30, 12, 6, 3, -0.5, c);
  },
  chair(x, c, c2) {
    rrect(x, 16, 8, 28, 26, 3); fs(x, c, 2.5); rrect(x, 20, 12, 20, 16, 2); fs(x, c2, 1.5);
    rrect(x, 12, 32, 36, 8, 2); fs(x, c, 2.5);
    for (const a of [14, 42]) { rrect(x, a, 40, 5, 18, 1); fs(x, c2, 2); }
  },
  crate(x, c, c2) {
    rrect(x, 10, 14, 44, 40, 3); fs(x, c, 2.5); x.strokeStyle = c2; x.lineWidth = 3;
    x.beginPath(); x.moveTo(10, 28); x.lineTo(54, 28); x.moveTo(10, 42); x.lineTo(54, 42); x.moveTo(12, 16); x.lineTo(52, 52); x.stroke();
  },
  table(x, c, c2) {
    poly(x, [6, 26, 40, 16, 58, 24, 24, 36]); fs(x, shade(c, 0.15), 2.5);
    poly(x, [6, 26, 24, 36, 24, 40, 6, 30]); fs(x, c, 2); poly(x, [24, 36, 58, 24, 58, 28, 24, 40]); fs(x, c2, 2);
    for (const [a, b] of [[9, 30], [26, 40], [54, 28]]) { rrect(x, a, b, 4, 18, 1); fs(x, c2, 2); }
  },
  cabinet(x, c, c2) {
    rrect(x, 12, 6, 40, 52, 4); fs(x, c, 2.5); rrect(x, 16, 10, 15, 30, 2); fs(x, shade(c, 0.12), 1.5); rrect(x, 33, 10, 15, 30, 2); fs(x, shade(c, 0.12), 1.5);
    rrect(x, 16, 44, 32, 10, 2); fs(x, c2, 1.5); for (const a of [28, 36]) { ellipse(x, a, 26, 1.8, 1.8); x.fillStyle = '#f2c230'; x.fill(); }
  },
  spool(x, c, c2) {
    rrect(x, 16, 8, 32, 8, 3); fs(x, c2, 2.5); rrect(x, 16, 48, 32, 8, 3); fs(x, c2, 2.5);
    rrect(x, 20, 16, 24, 32, 3); fs(x, c, 2.5); x.strokeStyle = shade(c, -0.15); x.lineWidth = 1; for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(21, 19 + i * 4); x.lineTo(43, 21 + i * 4); x.stroke(); }
  },
  cloth(x, c, c2) {
    rrect(x, 8, 22, 48, 26, 4); fs(x, c, 2.5); ellipse(x, 52, 35, 6, 13); fs(x, c2, 2.5);
    x.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { ellipse(x, 14 + i * 10, 28 + j * 8, 2, 2); x.fill(); }
  },
  brick(x, c, c2) {
    for (const [a, b] of [[8, 34], [32, 34], [20, 18]]) { rrect(x, a, b, 24, 14, 2); fs(x, c, 2.5); x.fillStyle = c2; x.fillRect(a + 2, b + 9, 20, 3); }
  },
  pot(x, c, c2) {
    x.beginPath(); x.moveTo(14, 18); x.lineTo(50, 18); x.lineTo(44, 56); x.lineTo(20, 56); x.closePath(); fs(x, c, 2.5);
    rrect(x, 10, 12, 44, 10, 3); fs(x, c2, 2.5); x.strokeStyle = shade(c, 0.25); x.lineWidth = 2; x.beginPath(); x.moveTo(18, 36); x.lineTo(46, 36); x.stroke();
  },
  vase(x, c, c2) {
    x.beginPath(); x.moveTo(26, 10); x.lineTo(38, 10); x.quadraticCurveTo(36, 20, 44, 28); x.quadraticCurveTo(54, 40, 42, 56); x.lineTo(22, 56); x.quadraticCurveTo(10, 40, 20, 28); x.quadraticCurveTo(28, 20, 26, 10); fs(x, c, 2.5);
    for (const [a, b] of [[26, 38], [38, 38], [32, 46]]) { ellipse(x, a, b, 4, 4); fs(x, c2, 1.5); }
  },
  ingot(x, c, c2) {
    for (const dy of [12, 0]) { poly(x, [10, 44 - dy, 18, 30 - dy, 46, 30 - dy, 54, 44 - dy]); fs(x, c, 2.5); poly(x, [18, 30 - dy, 46, 30 - dy, 42, 24 - dy, 22, 24 - dy]); fs(x, shade(c, 0.3), 2); x.fillStyle = c2; x.fillRect(12, 41 - dy, 40, 3); }
  },
  nails(x, c, c2) {
    for (const [a, r] of [[-12, -0.3], [0, 0], [12, 0.3]]) { x.save(); x.translate(32 + a, 32); x.rotate(r); rrect(x, -2.5, -16, 5, 34, 1); fs(x, c, 2); rrect(x, -7, -20, 14, 5, 2); fs(x, c2, 2); x.restore(); }
  },
  gear(x, c, c2) {
    x.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const r = i % 2 ? 22 : 16; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.closePath(); fs(x, c, 2.5);
    ellipse(x, 32, 32, 7, 7); fs(x, c2, 2);
  },
  glass(x, c, c2) {
    poly(x, [12, 12, 50, 8, 54, 52, 14, 56]); fs(x, c, 2.5); x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(20, 20); x.lineTo(30, 16); x.moveTo(20, 28); x.lineTo(40, 20); x.stroke();
    x.strokeStyle = c2; x.lineWidth = 2; x.strokeRect(14, 14, 0, 0);
  },
  lamp(x, c, c2) {
    rrect(x, 22, 6, 20, 6, 2); fs(x, c2, 2); x.beginPath(); x.moveTo(20, 14); x.lineTo(44, 14); x.lineTo(48, 46); x.lineTo(16, 46); x.closePath(); fs(x, '#fff8e1', 2.5);
    ellipse(x, 32, 32, 6, 10); x.fillStyle = c; x.fill(); rrect(x, 14, 46, 36, 10, 3); fs(x, c2, 2.5);
  },
  bouquet(x, c, c2) {
    poly(x, [20, 30, 44, 30, 36, 58, 28, 58]); fs(x, '#81c784', 2.5);
    for (const [a, b, col] of [[22, 22, c], [42, 22, c2], [32, 14, c], [28, 30, c2], [38, 30, c]] as const) { ellipse(x, a, b, 8, 8); fs(x, col, 2); ellipse(x, a, b, 3, 3); x.fillStyle = '#fff59d'; x.fill(); }
  },
  perfume(x, c, c2) {
    rrect(x, 26, 6, 12, 10, 3); fs(x, '#f2c230', 2); ellipse(x, 32, 38, 20, 18); fs(x, c, 2.5); gloss(x, 24, 30, 5, 7, 0.5);
    ellipse(x, 32, 40, 8, 8); x.fillStyle = c2; x.fill();
  },
  cart(x, c, c2) {
    rrect(x, 6, 18, 44, 22, 3); fs(x, c, 2.5); x.strokeStyle = shade(c, -0.25); x.lineWidth = 2; x.beginPath(); x.moveTo(8, 28); x.lineTo(48, 28); x.stroke();
    x.beginPath(); x.moveTo(50, 30); x.lineTo(60, 26); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    for (const a of [18, 40]) { ellipse(x, a, 46, 9, 9); fs(x, c2, 2.5); ellipse(x, a, 46, 2.5, 2.5); x.fillStyle = INK; x.fill(); }
  },
  musicbox(x, c, c2) {
    rrect(x, 10, 26, 44, 28, 4); fs(x, c, 2.5); poly(x, [10, 26, 18, 10, 54, 10, 54, 26]); fs(x, shade(c, 0.15), 2.5);
    rrect(x, 26, 34, 12, 8, 2); fs(x, c2, 2); x.beginPath(); x.moveTo(54, 40); x.lineTo(60, 40); x.lineWidth = 3; x.strokeStyle = c2; x.stroke();
  },
  ring(x, c, c2) {
    ellipse(x, 32, 40, 16, 14); x.lineWidth = 9; x.strokeStyle = INK; x.stroke(); x.lineWidth = 6; x.strokeStyle = c; x.stroke();
    poly(x, [24, 22, 32, 10, 40, 22, 32, 30]); fs(x, c2, 2.5); gloss(x, 30, 18, 2, 3, 0.6);
  },
  necklace(x, c, c2) {
    x.beginPath(); x.moveTo(10, 10); x.quadraticCurveTo(32, 50, 54, 10); x.lineWidth = 5; x.strokeStyle = INK; x.stroke(); x.lineWidth = 3; x.strokeStyle = c; x.stroke();
    poly(x, [32, 34, 42, 44, 32, 58, 22, 44]); fs(x, c2, 2.5); gloss(x, 30, 42, 2, 4, 0.6);
  },
  coin(x) {
    ellipse(x, 32, 32, 22, 22); fs(x, '#f2b632', 3); ellipse(x, 32, 32, 15, 15); x.strokeStyle = '#c98a10'; x.lineWidth = 2.5; x.stroke();
    x.fillStyle = '#c98a10'; x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 32, 33); gloss(x, 24, 22, 6, 3, 0.5);
  },
  star(x) {
    x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2; const r = i % 2 ? 10 : 24; x.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r); } x.closePath(); fs(x, '#ffd54f', 3);
  },
  heart(x) {
    x.beginPath(); x.moveTo(32, 54); x.bezierCurveTo(4, 36, 12, 8, 32, 22); x.bezierCurveTo(52, 8, 60, 36, 32, 54); fs(x, '#e53950', 3); gloss(x, 22, 24, 5, 3, 0.5);
  },
};

export function drawIcon(ctx: Ctx, spec: IconSpec, size: number, ox = 0, oy = 0) {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(size / 64, size / 64);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  (P[spec.s] ?? P.blob)(ctx, spec.c, spec.c2 ?? shade(spec.c, -0.3));
  ctx.restore();
}

const cache = new Map<string, string>();

/** data URL do ícone de um item (ou 'coin' / 'star' / 'heart'). */
export function iconUrl(id: string, size = 64): string {
  const key = `${id}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const spec: IconSpec = ITEM_BY_ID[id]?.icon ?? { s: id, c: '#999' };
  const { c, ctx } = canvas(size, size);
  drawIcon(ctx, spec, size);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function iconCanvas(id: string, size = 64): HTMLCanvasElement {
  const spec: IconSpec = ITEM_BY_ID[id]?.icon ?? { s: id, c: '#999' };
  const { c, ctx } = canvas(size, size);
  drawIcon(ctx, spec, size);
  return c;
}
