// Captura a vitrine 3D (preview.html) para revisão visual. Uso: node tests/e2e/shot3d.mjs "<query>" saida.png [WxH]
import { chromium } from '@playwright/test';
const [q = '', out = 'test-results/p3d.png', size = '1400x900'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: w, height: h } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/preview.html?' + q);
await p.waitForTimeout(Number(process.env.WAIT ?? 1800));
await p.screenshot({ path: out });
const diag = await p.evaluate(() => window.__preview?.eng.diagnostics());
console.log('ok', out, JSON.stringify(diag), errs.join(' | '));
await b.close();
