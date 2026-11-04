// QA de layout: abre a fazenda de vitrine em cada resolução-alvo, tira prints (mundo + painel)
// e acusa rolagem horizontal ou elementos da interface saindo da tela.
// Uso: node tests/e2e/viewports.mjs [url]   (precisa de .showcase.json; ver showcase.mjs)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const acc = JSON.parse(readFileSync(new URL('../../.showcase.json', import.meta.url), 'utf8'));
const SIZES = [[320, 640], [360, 800], [390, 844], [430, 932], [768, 1024], [1366, 768], [1920, 1080], [844, 390]];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const [w, h] of SIZES) {
  const touch = w < 800 || h < 500;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url);
  await p.fill('input[name=username]', acc.u); await p.fill('input[name=password]', acc.pw);
  if (w === 390) await p.screenshot({ path: `test-results/vp-${w}x${h}-login.png` });
  await p.getByRole('button', { name: 'Entrar', exact: true }).click();
  await p.getByTestId('farm-row').first().click();
  await p.getByTestId('hud-level').waitFor({ timeout: 60000 });
  await p.waitForTimeout(3000);
  const diag = await p.evaluate(() => window.__mutirao?.scene.eng.diagnostics());
  const check = () => p.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`rolagem horizontal ${document.documentElement.scrollWidth}`);
    for (const el of document.querySelectorAll('.topbar *, .nav *, .hud-actions *, .quest *, .quest-pill *, .sheet-head *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || getComputedStyle(el).visibility === 'hidden') continue;
      if (r.right > innerWidth + 1 || r.left < -1) out.push(`fora da tela: ${el.className || el.tagName} (${Math.round(r.left)}..${Math.round(r.right)})`);
    }
    return out;
  });
  const world = await check();
  await p.screenshot({ path: `test-results/vp-${w}x${h}.png` });
  await p.getByTestId('dock-inventory').click();
  await p.waitForTimeout(500);
  const panel = await check();
  await p.screenshot({ path: `test-results/vp-${w}x${h}-panel.png` });
  const issues = [...new Set([...world, ...panel])];
  bad += issues.length + errs.length;
  console.log(`${w}x${h}: ${issues.length ? issues.join('; ') : 'ok'} | ${JSON.stringify(diag)}${errs.length ? ' | erros: ' + errs.join(' | ') : ''}`);
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
