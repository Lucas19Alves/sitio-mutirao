// Fumaça no ambiente publicado: cadastro → personagem → fazenda → jogo carregado.
// Uso: node tests/e2e/smoke-prod.mjs https://sitio-mutirao.vercel.app
import { chromium, devices } from '@playwright/test';
const url = process.argv[2];
const browser = await chromium.launch();
const errs = [];
for (const [name, opts] of [['desktop', { viewport: { width: 1366, height: 768 } }], ['mobile', devices['Pixel 7']]]) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  p.on('console', (m) => m.type() === 'error' && errs.push(`[${name}] ${m.text()}`));
  p.on('pageerror', (e) => errs.push(`[${name}] ${e.message}`));
  const u = `smoke_${name[0]}_${Date.now().toString(36).slice(-5)}`, pw = `Smoke-${Math.random().toString(36).slice(2, 10)}`;
  await p.goto(url);
  await p.getByRole('tab', { name: 'Criar conta' }).click();
  await p.fill('input[name=username]', u); await p.fill('input[name=password]', pw); await p.fill('input[name=confirm]', pw);
  await p.getByRole('button', { name: 'Criar conta e entrar' }).click();
  await p.getByTestId('save-look').click({ timeout: 30000 });
  await p.getByTestId('create-farm').click();
  await p.getByTestId('hud-level').waitFor({ timeout: 60000 });
  await p.locator('[data-testid=net-status]', { hasText: 'online' }).waitFor({ timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `test-results/prod-${name}.png` });
  console.log(`✓ ${name}: jogo carregado e conectado`);
  await ctx.close();
}
console.log('erros de console:', errs.length ? errs.join('\n') : 'nenhum');
await browser.close();
