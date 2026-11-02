// Teste de integração do backend real (Supabase). Cria duas contas novas.
// Uso: node tests/backend.mjs   (lê VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY do .env)
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { WORLD_NODES } from '../src/data/world.ts';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => l.trim().split(/=(.*)/s).slice(0, 2)));
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY, DOMAIN = env.VITE_USERNAME_EMAIL_DOMAIN;

const tag = Date.now().toString(36).slice(-5);
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false } });

async function signup(name) {
  const r = await fetch(`${URL_}/functions/v1/auth-signup`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'senha-teste-123' }) });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  const c = mk();
  const { error } = await c.auth.signInWithPassword({ email: `${name}@${DOMAIN}`, password: 'senha-teste-123' });
  assert.ifError(error);
  return c;
}

const act = async (c, farm, actions) => {
  const { data, error } = await c.rpc('farm_act', { p_farm: farm, p_batch: randomUUID(), p_actions: actions });
  assert.ifError(error);
  return data;
};

const a = await signup(`ta_${tag}`);
const b = await signup(`tb_${tag}`);
console.log('✓ cadastro + login de duas contas');

// username duplicado
const dup = await fetch(`${URL_}/functions/v1/auth-signup`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `ta_${tag}`, password: 'outra-senha-1' }) });
assert.equal(dup.status, 409);
console.log('✓ username duplicado recusado');

const { data: farm, error: fe } = await a.rpc('create_farm', { p_name: 'Teste Coop' });
assert.ifError(fe);
const { data: st } = await a.rpc('get_farm_state', { p_farm: farm });
assert.equal(st.farm.coins, 60);
const code = st.farm.invite_code;

// B ainda não é membro: não vê nada
const { error: notMember } = await b.rpc('get_farm_state', { p_farm: farm });
assert.ok(notMember, 'não-membro deveria ser recusado');
const { data: rows } = await b.from('farms').select('id');
assert.equal(rows.length, 0, 'RLS deveria esconder fazendas alheias');

const { data: joined, error: je } = await b.rpc('join_farm', { p_code: code });
assert.ifError(je);
assert.equal(joined, farm);
console.log('✓ criação de fazenda e entrada por convite', code);

// Cliente não consegue alterar moedas diretamente
const { error: upErr } = await a.from('farms').update({ coins: 999999 }).eq('id', farm);
const { data: after } = await a.from('farms').select('coins').eq('id', farm).single();
assert.equal(after.coins, 60, 'update direto não pode mudar moedas ' + (upErr?.message ?? ''));
console.log('✓ update direto de moedas bloqueado');

// Coleta simultânea do MESMO nó: só um recebe
const tree = WORLD_NODES.find((n) => n.r === 'sitio' && n.t === 'tree_oak');
const [ra, rb] = await Promise.all([act(a, farm, [{ t: 'harvest', n: tree.id }]), act(b, farm, [{ t: 'harvest', n: tree.id }])]);
const oks = [ra.res[0].ok, rb.res[0].ok].filter(Boolean).length;
assert.equal(oks, 1, 'apenas um jogador pode colher o mesmo nó');
const lose = ra.res[0].ok ? rb : ra;
assert.equal(lose.res[0].e, 'node_depleted');
console.log('✓ coleta simultânea do mesmo nó não duplica recurso');

// Coleta simultânea de nós diferentes: ambos recebem
const trees = WORLD_NODES.filter((n) => n.r === 'sitio' && n.t === 'tree_oak' && n.id !== tree.id);
const grass = WORLD_NODES.filter((n) => n.r === 'sitio' && n.t === 'grass');
await Promise.all([
  act(a, farm, trees.slice(0, 4).map((n) => ({ t: 'harvest', n: n.id }))),
  act(b, farm, grass.slice(0, 5).map((n) => ({ t: 'harvest', n: n.id }))),
]);
let s2 = (await a.rpc('get_farm_state', { p_farm: farm })).data;
assert.equal(s2.inv.wood, 4 + 2 + 8);
assert.equal(s2.inv.fiber, 10);
console.log('✓ coleta simultânea de nós diferentes', s2.inv);

// Idempotência: mesmo batch reenviado não aplica duas vezes
const batch = randomUUID();
const once = await a.rpc('farm_act', { p_farm: farm, p_batch: batch, p_actions: [{ t: 'sell', i: 'fiber', q: 2 }] });
const twice = await a.rpc('farm_act', { p_farm: farm, p_batch: batch, p_actions: [{ t: 'sell', i: 'fiber', q: 2 }] });
assert.ok(once.data.res[0].ok && twice.data.dup);
console.log('✓ reenvio do mesmo lote é ignorado');

// Gasto simultâneo do mesmo recurso: estoque nunca fica negativo
s2 = (await a.rpc('get_farm_state', { p_farm: farm })).data;
const fiber = s2.inv.fiber; // 8
const [sa, sb] = await Promise.all([act(a, farm, [{ t: 'sell', i: 'fiber', q: fiber }]), act(b, farm, [{ t: 'sell', i: 'fiber', q: fiber }])]);
assert.equal([sa.res[0].ok, sb.res[0].ok].filter(Boolean).length, 1, 'só uma venda do mesmo estoque');
console.log('✓ gasto simultâneo do mesmo estoque bloqueado');

// Projeto coletivo: bancada (10 moedas + 5 madeira) com contribuição dos dois
const g1 = await act(a, farm, [{ t: 'give', k: 'b:workbench', i: 'wood', q: 3 }]);
assert.ok(g1.res[0].ok && !g1.res[0].done, JSON.stringify(g1.res));
const g2 = await act(b, farm, [{ t: 'give', k: 'b:workbench', i: 'wood', q: 5 }, { t: 'give', k: 'b:workbench', i: 'coins', q: 10 }]);
assert.ok(g2.res[1].done, JSON.stringify(g2.res));
assert.ok(g2.res[1].coop, 'deveria dar bônus de cooperação');
console.log('✓ projeto coletivo concluído com bônus de cooperação');

// Ferramenta + plantio + falha de colheita antes da hora
const t1 = await act(a, farm, [{ t: 'quest' }, { t: 'quest' }]);
console.log('  missões', JSON.stringify(t1.res));
s2 = (await a.rpc('get_farm_state', { p_farm: farm })).data;
console.log('  estado', { coins: s2.farm.coins, level: s2.farm.level, xp: s2.farm.xp, inv: s2.inv });
const pl = await act(b, farm, [{ t: 'plant', e: 'field', i: 0, c: 'wheat' }, { t: 'plant', e: 'field', i: 0, c: 'wheat' }, { t: 'reap', e: 'field', i: 0 }]);
assert.ok(pl.res[0].ok);
assert.equal(pl.res[1].e, 'plot_busy');
assert.equal(pl.res[2].e, 'not_ready');
console.log('✓ plantio, canteiro ocupado e colheita antecipada recusados corretamente');

// Pedido sem itens falha; venda gera moedas
const ord = await act(a, farm, [{ t: 'order', o: 0 }]);
assert.ok(!ord.res[0].ok);
const sell = await act(a, farm, [{ t: 'sell', i: 'wood', q: 1 }]);
assert.ok(sell.res[0].ok && sell.res[0].g === 2);
console.log('✓ pedido sem itens recusado, venda credita moedas');

// Membros e perfis visíveis entre colegas
const { data: profs } = await a.from('profiles').select('username');
assert.equal(profs.length, 2);
const { error: lookErr } = await b.from('profiles').update({ character_config: { hair: 2 } }).eq('user_id', (await b.auth.getUser()).data.user.id);
assert.ifError(lookErr);
console.log('✓ perfis de colegas visíveis e aparência salva');

console.log(`\nOK — fazenda ${farm} (${code}) com ta_${tag} / tb_${tag}`);
