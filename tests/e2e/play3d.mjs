// Joga a fazenda de vitrine com entrada real e tira prints (QA visual do 3D).
// Uso: node tests/e2e/play3d.mjs "<passos>" [WxH] [url]
// passos separados por |: wait:ms · key:w:ms (segura a tecla) · shot:nome · tp:x:z (teleporta, tiles)
//   · eval:<js> · log:<js>
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [steps = 'wait:2500|shot:main', size = '1366x768', url = 'http://localhost:5173/'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const acc = JSON.parse(readFileSync(new URL('../../.showcase.json', import.meta.url), 'utf8'));
const touch = w < 800;
const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && !/WebSocket|favicon|DevTools/.test(m.text()) && errs.push(m.text()));
await p.goto(url);
await p.fill('input[name=username]', acc.u); await p.fill('input[name=password]', acc.pw);
await p.getByRole('button', { name: 'Entrar', exact: true }).click();
await p.getByTestId('farm-row').first().click();
await p.getByTestId('hud-level').waitFor({ timeout: 90000 });
for (const s of steps.split('|')) {
  const [cmd, ...a] = s.split(':');
  if (cmd === 'wait') await p.waitForTimeout(Number(a[0]));
  else if (cmd === 'key') { await p.keyboard.down(a[0]); await p.waitForTimeout(Number(a[1])); await p.keyboard.up(a[0]); }
  else if (cmd === 'shot') await p.screenshot({ path: `test-results/g3-${a[0]}-${w}x${h}.png` });
  else if (cmd === 'tp') await p.evaluate(([x, z]) => { const m = window.__mutirao.scene.me; m.x = Number(x); m.z = Number(z); }, a);
  else if (cmd === 'eval') await p.evaluate(a.join(':'));
  else if (cmd === 'log') console.log(JSON.stringify(await p.evaluate(a.join(':'))));
}
const diag = await p.evaluate(() => window.__mutirao?.scene.eng.diagnostics());
console.log('diag', JSON.stringify(diag), 'erros:', errs.length ? errs.join(' | ') : 'nenhum');
await b.close();
