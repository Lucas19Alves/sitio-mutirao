// E2E real: dois navegadores independentes, duas contas novas, Supabase de verdade.
import { test, expect, devices, type Page, type BrowserContext } from '@playwright/test';

const tag = Date.now().toString(36).slice(-6);
const PASS = `pw-${tag}-Senha!9`;
const A = `coop_a_${tag}`;
const B = `coop_b_${tag}`;

type Hook = {
  store: { farm: { id: string; coins: number; level: number; xp: number; invite_code: string; progression: { quest: number; regions: string[] } }; inv: Record<string, number>; ents: Record<string, { level: number }>; connected: boolean; online: Set<string>; act: (a: unknown) => Promise<{ ok: boolean; e?: string }>; bagUsed: () => number };
  scene: { me: { lx: number; ly: number }; interact: (t: unknown) => void; zone: { k: string; id?: string } | null };
  remotes: () => { u: string; x: number; y: number }[];
};
const hook = (p: Page) => p.evaluate(() => !!(window as unknown as { __mutirao?: Hook }).__mutirao);
const st = <T,>(p: Page, fn: (h: Hook) => T) => p.evaluate(`(${fn.toString()})(window.__mutirao)`) as Promise<T>;

function watchConsole(p: Page, name: string, errors: string[]) {
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message}`));
}

async function signupAndSetup(p: Page, user: string) {
  await p.goto('/');
  await p.getByRole('tab', { name: 'Criar conta' }).click();
  await p.locator('input[name=username]').fill(user);
  await p.locator('input[name=password]').fill(PASS);
  await p.locator('input[name=confirm]').fill(PASS);
  await p.getByRole('button', { name: 'Criar conta e entrar' }).click();
  // criação de personagem (primeiro acesso)
  await expect(p.getByText('Quem vai trabalhar na roça?')).toBeVisible();
  await p.getByRole('button', { name: 'Boné' }).click();
  await p.getByRole('button', { name: 'Cacheado' }).click();
  await p.getByTestId('save-look').click();
  await expect(p.getByRole('heading', { name: 'Suas fazendas' })).toBeVisible();
}

async function waitGame(p: Page) {
  await expect(p.getByTestId('hud-level')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => hook(p)).toBe(true);
  await expect(p.getByTestId('net-status')).toHaveText('online', { timeout: 30_000 });
}

test('cooperativo com dois jogadores reais', async ({ browser }) => {
  test.setTimeout(480_000); // dois mundos 3D em navegadores sem GPU
  const errors: string[] = [];
  const ctxA: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB: BrowserContext = await browser.newContext({ ...devices['iPhone 13'] });
  const pa = await ctxA.newPage(), pb = await ctxB.newPage();
  watchConsole(pa, 'A', errors); watchConsole(pb, 'B', errors);

  // 1-2. cadastro de dois usuários e login simultâneo
  await Promise.all([signupAndSetup(pa, A), signupAndSetup(pb, B)]);

  // 3. criação da fazenda
  await pa.getByTestId('farm-name').fill(`Mutirão ${tag}`);
  await pa.getByTestId('create-farm').click();
  await waitGame(pa);
  const code = await st(pa, (h) => h.store.farm.invite_code);
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // 4. segundo jogador entra pelo convite
  await pb.getByTestId('join-code').fill(code);
  await pb.getByTestId('join-farm').click();
  await waitGame(pb);
  const farmA = await st(pa, (h) => h.store.farm.id);
  expect(await st(pb, (h) => h.store.farm.id)).toBe(farmA);

  // 5. cada um vê o personagem do outro
  await expect.poll(() => st(pa, (h) => h.remotes().length), { timeout: 30_000 }).toBe(1);
  await expect.poll(() => st(pb, (h) => h.remotes().length), { timeout: 30_000 }).toBe(1);
  await expect(pa.locator('.pl.on')).toHaveCount(2);

  // 6. movimentação sincronizada: A anda para a direita com o teclado
  const before = await st(pb, (h) => h.remotes()[0]);
  await pa.locator('[data-testid=game-canvas] canvas').focus().catch(() => {});
  // seta para a esquerda da tela = diagonal da grade rumo ao campo (livre de obstáculos)
  await pa.keyboard.down('a'); await pa.waitForTimeout(1800); await pa.keyboard.up('a');
  const meA = await st(pa, (h) => ({ x: h.scene.me.lx, y: h.scene.me.ly }));
  // B vê A se deslocar e chegar à mesma posição (px lógicos)
  await expect.poll(async () => { const r = await st(pb, (h) => h.remotes()[0]); return Math.hypot(r.x - before.x, r.y - before.y); }, { timeout: 10_000 }).toBeGreaterThan(40);
  await expect.poll(async () => { const r = await st(pb, (h) => h.remotes()[0]); return Math.hypot(r.x - meA.x, r.y - meA.y); }, { timeout: 10_000 }).toBeLessThan(8);

  // 7. coleta automática por proximidade: cada um anda até uma árvore e corta sozinho (sem tecla de ação)
  const trees = await pa.evaluate(async () => {
    const mod = '/src/data/world.ts';
    const { WORLD_NODES } = await import(/* @vite-ignore */ mod);
    return WORLD_NODES.filter((n: { r: string; t: string }) => n.r === 'sitio' && n.t === 'tree_oak').map((n: { id: string }) => n.id);
  });
  await pa.evaluate((ids) => { (window as unknown as { __t: string[] }).__t = ids; }, trees);
  await pb.evaluate((ids) => { (window as unknown as { __t: string[] }).__t = ids; }, trees);
  const harvest = async (p: Page, idx: number) => {
    await p.evaluate((i) => { const w = window as unknown as { __mutirao: Hook; __t: string[] }; w.__mutirao.scene.interact({ kind: 'node', id: w.__t[i] }); }, idx);
  };
  await Promise.all([harvest(pa, 0), harvest(pb, 1)]);
  // a madeira vai para a mochila de cada um, não direto para o estoque
  await expect.poll(() => st(pa, (h) => h.store.bagUsed()), { timeout: 40_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => st(pb, (h) => h.store.bagUsed()), { timeout: 40_000 }).toBeGreaterThanOrEqual(2);
  expect(await st(pa, (h) => h.store.inv.wood ?? 0)).toBe(4);
  // cada um caminha até o Celeiro: o depósito acontece ao chegar perto (e o painel abre sozinho)
  for (const p of [pa, pb]) await p.evaluate(() => (window as unknown as { __mutirao: Hook }).__mutirao.scene.interact({ kind: 'building', id: 'barn' }));
  await expect.poll(() => st(pa, (h) => h.scene.zone?.id ?? ''), { timeout: 30_000 }).toBe('barn');
  await expect(pa.getByTestId('ctx-panel').locator('.sheet')).toBeVisible();
  await expect.poll(() => st(pa, (h) => h.store.inv.wood ?? 0), { timeout: 40_000 }).toBeGreaterThanOrEqual(4 + 4);
  await expect.poll(() => st(pb, (h) => h.store.bagUsed()), { timeout: 40_000 }).toBe(0);
  // mesmo nó ao mesmo tempo: só um ganha
  const race = await Promise.all([
    pa.evaluate(() => { const w = window as unknown as { __mutirao: Hook; __t: string[] }; return w.__mutirao.store.act({ t: 'harvest', n: w.__t[2] }); }),
    pb.evaluate(() => { const w = window as unknown as { __mutirao: Hook; __t: string[] }; return w.__mutirao.store.act({ t: 'harvest', n: w.__t[2] }); }),
  ]);
  expect(race.filter((r) => r.ok).length).toBe(1);
  // quem ganhou guarda no celeiro (ação validada no servidor)
  await Promise.all([pa, pb].map((p) => p.evaluate(() => (window as unknown as { __mutirao: Hook }).__mutirao.store.act({ t: 'deposit' }))));
  // 8. inventário compartilhado idêntico nos dois clientes
  await expect.poll(async () => JSON.stringify(await st(pb, (h) => h.store.inv))).toBe(JSON.stringify(await st(pa, (h) => h.store.inv)));
  const wood = await st(pa, (h) => h.store.inv.wood);
  expect(wood).toBeGreaterThanOrEqual(4 + 2 + 2 + 2);
  expect(await st(pa, (h) => h.store.bagUsed()) + await st(pb, (h) => h.store.bagUsed())).toBe(0);

  // 9. venda pela interface (A no desktop) e saldo compartilhado
  const coins0 = await st(pb, (h) => h.store.farm.coins);
  await pa.getByTestId('dock-sell').click();
  await pa.locator('.sell-row').filter({ hasText: 'Madeira' }).locator('.qty input').fill('2');
  await pa.getByTestId('sell-wood').click();
  await expect.poll(() => st(pb, (h) => h.store.farm.coins)).toBe(coins0 + 4);
  await pa.getByRole('button', { name: 'Fechar painel' }).click();

  // 10. construção coletiva da Bancada pelo Quadro de Projetos (B no celular entrega)
  await pb.getByTestId('dock-projects').click();
  await pb.getByTestId('start-b:workbench').click();
  await expect(pb.getByTestId('proj-b:workbench')).toBeVisible();
  await pb.getByTestId('give-all-b:workbench').click();
  await expect.poll(() => st(pa, (h) => h.store.ents.workbench?.level ?? 0), { timeout: 20_000 }).toBe(1);
  await pb.getByRole('button', { name: 'Fechar painel' }).click();

  // 11. progressão: missões 1 e 2 concluídas, recompensa e XP em ambos
  const xp0 = await st(pa, (h) => h.store.farm.xp + h.store.farm.level * 1000);
  await expect(pa.getByTestId('quest-claim')).toBeVisible();
  await pa.getByTestId('quest-claim').click();
  await expect.poll(() => st(pb, (h) => h.store.farm.progression.quest)).toBe(1);
  await expect(pa.getByTestId('quest-claim')).toBeVisible();
  await pa.getByTestId('quest-claim').click();
  await expect.poll(() => st(pb, (h) => h.store.farm.progression.quest)).toBe(2);
  expect(await st(pb, (h) => h.store.farm.xp + h.store.farm.level * 1000)).toBeGreaterThan(xp0);

  // 12. reconexão: B fica offline, A vende, B volta e recebe o estado atual
  await ctxB.setOffline(true);
  await expect(pb.getByTestId('net-status')).toHaveText('reconectando', { timeout: 45_000 });
  const r = await pa.evaluate(() => (window as unknown as { __mutirao: Hook }).__mutirao.store.act({ t: 'sell', i: 'wood', q: 1 }));
  expect(r.ok).toBe(true);
  const coinsA = await st(pa, (h) => h.store.farm.coins);
  await ctxB.setOffline(false);
  await expect(pb.getByTestId('net-status')).toHaveText('online', { timeout: 60_000 });
  await expect.poll(() => st(pb, (h) => h.store.farm.coins), { timeout: 30_000 }).toBe(coinsA);
  await expect.poll(() => st(pa, (h) => h.remotes().length), { timeout: 30_000 }).toBe(1);

  // 13. persistência: B recarrega e volta direto para a mesma fazenda com o mesmo estado
  await pb.reload();
  await waitGame(pb);
  expect(await st(pb, (h) => h.store.farm.coins)).toBe(coinsA);
  expect(await st(pb, (h) => h.store.ents.workbench?.level)).toBe(1);

  // 14. layout: nada vaza horizontalmente e HUD essencial visível nos dois formatos
  for (const [p, name] of [[pa, 'desktop'], [pb, 'mobile']] as const) {
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `overflow ${name}`).toBeLessThanOrEqual(0);
    for (const id of ['hud-level', 'hud-coins', 'dock-inventory', 'dock-projects', 'quest-card']) await expect(p.getByTestId(id)).toBeVisible();
    await p.screenshot({ path: `test-results/coop-${name}.png` });
  }
  await pb.getByTestId('dock-orders').click();
  await expect(pb.getByTestId('contract')).toBeVisible();
  await pb.screenshot({ path: 'test-results/coop-mobile-orders.png' });

  const real = errors.filter((e) => !/favicon|Download the React DevTools|net::ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|WebSocket|Failed to fetch|websocket/i.test(e));
  expect(real, real.join('\n')).toEqual([]);
  await ctxA.close(); await ctxB.close();
});
