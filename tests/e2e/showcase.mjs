// QA visual: cria uma conta + fazenda de vitrine e salva o id para avançar via SQL.
// Uso: node tests/e2e/showcase.mjs signup | shots <regiões...>
import { chromium } from '@playwright/test';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const F = new URL('../../test-results/showcase.json', import.meta.url);
const mode = process.argv[2];
const browser = await chromium.launch();
const vp = process.argv.includes('--mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', (e) => errs.push(e.message));
let acc = existsSync(F) ? JSON.parse(readFileSync(F, 'utf8')) : null;
if (mode === 'signup') {
  const u = 'vitrine_' + Date.now().toString(36).slice(-5), pw = 'Vitrine-' + Math.random().toString(36).slice(2, 10);
  await p.goto('http://localhost:5173/');
  await p.getByRole('tab', { name: 'Criar conta' }).click();
  await p.fill('input[name=username]', u); await p.fill('input[name=password]', pw); await p.fill('input[name=confirm]', pw);
  await p.getByRole('button', { name: 'Criar conta e entrar' }).click();
  await p.getByText('Quem vai trabalhar na roça?').waitFor();
  await p.screenshot({ path: 'test-results/shot-character.png' });
  await p.getByTestId('save-look').click();
  await p.getByTestId('create-farm').click();
  await p.getByTestId('hud-level').waitFor({ timeout: 60000 });
  const farm = await p.evaluate(() => window.__mutirao.store.farm.id);
  writeFileSync(F, JSON.stringify({ u, pw, farm }));
  console.log('farm', farm);
} else {
  await p.goto('http://localhost:5173/');
  await p.fill('input[name=username]', acc.u); await p.fill('input[name=password]', acc.pw);
  await p.getByRole('button', { name: 'Entrar', exact: true }).click();
  await p.getByTestId('farm-row').first().click();
  await p.getByTestId('hud-level').waitFor({ timeout: 60000 });
  await p.waitForTimeout(1500);
  const spots = process.argv.slice(3).filter((x) => !x.startsWith('--'));
  for (const s of spots) {
    const [x, y, z, panel] = s.split(',');
    await p.evaluate(([x, y, z]) => { const sc = window.__mutirao.scene; sc.cameras.main.stopFollow(); sc.cameras.main.setZoom(Number(z)); sc.cameras.main.centerOn(Number(x) * 32, Number(y) * 32); }, [x, y, z]);
    if (panel) await p.getByTestId(`dock-${panel}`).click();
    await p.waitForTimeout(700);
    await p.screenshot({ path: `test-results/shot-${s.replace(/,/g, '_')}${vp.width < 500 ? '-m' : ''}.png` });
    if (panel) await p.getByRole('button', { name: 'Fechar painel' }).click();
  }
}
console.log('erros:', errs.length ? errs.join('\n') : 'nenhum');
await browser.close();
