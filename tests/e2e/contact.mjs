// Folha de contato das artes procedurais, sobre um fundo de grama (QA de direção de arte).
// Uso: node tests/e2e/contact.mjs <módulo> <função> <saida.png> [escala]
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const [mod, fn, out, scale = '0.5'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/?' + (process.env.CELL ? 'cell=' + process.env.CELL + '&cols=' + (process.env.COLS || 6) : ''));
const url = await p.evaluate(async ([mod, fn, scale]) => {
  const m = await import(mod);
  const arts = await m[fn]();
  const entries = Object.entries(arts).map(([k, a]) => [k, a.c ? a : { c: a, ox: 0.5, oy: 1 }]);
  const s = Number(scale), cols = Number(new URLSearchParams(location.search).get('cols') || 8), cell = Number(new URLSearchParams(location.search).get('cell') || 170);
  const rows = Math.ceil(entries.length / cols);
  const c = document.createElement('canvas'); c.width = cols * cell; c.height = rows * cell;
  const x = c.getContext('2d');
  x.fillStyle = '#7cbf4f'; x.fillRect(0, 0, c.width, c.height);
  entries.forEach(([k, a], i) => {
    const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
    const w = a.c.width * s, h = a.c.height * s;
    const fit = Math.min(1, (cell - 24) / w, (cell - 24) / h);
    x.drawImage(a.c, cx + (cell - w * fit) / 2, cy + (cell - 18 - h * fit) / 2, w * fit, h * fit);
    x.fillStyle = '#1b2440'; x.font = '12px sans-serif'; x.fillText(k, cx + 6, cy + cell - 6);
  });
  return c.toDataURL();
}, [mod, fn, scale]);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('ok', out, errs.join(' | '));
await b.close();
