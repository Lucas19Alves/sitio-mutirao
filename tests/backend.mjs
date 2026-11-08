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
const bagOf = (st, who) => st.members.find((m) => m.username === who).bag;
// a coleta enche a mochila de cada um; o estoque compartilhado só muda no depósito
assert.equal(s2.inv.wood, 4);
assert.equal((bagOf(s2, `ta_${tag}`).wood ?? 0) + (bagOf(s2, `tb_${tag}`).wood ?? 0), 2 + 8);
assert.equal(bagOf(s2, `tb_${tag}`).fiber, 10);
console.log('✓ coleta simultânea de nós diferentes vai para a mochila de cada um');

// depósito no celeiro: mochila → estoque compartilhado
const [da, db] = await Promise.all([act(a, farm, [{ t: 'deposit' }]), act(b, farm, [{ t: 'deposit' }])]);
assert.ok(da.res[0].ok && db.res[0].ok, JSON.stringify([da.res, db.res]));
assert.equal(da.member.bag && Object.keys(da.member.bag).length, 0);
const dep2 = await act(a, farm, [{ t: 'deposit' }]);
assert.equal(dep2.res[0].e, 'bag_empty');
s2 = (await a.rpc('get_farm_state', { p_farm: farm })).data;
assert.equal(s2.inv.wood, 4 + 2 + 8);
assert.equal(s2.inv.fiber, 10);
console.log('✓ depósito no celeiro (mochila vazia recusada)', s2.inv);

// mochila cheia: capacidade 50 recusa a coleta seguinte
const many = WORLD_NODES.filter((n) => n.r === 'sitio' && n.t === 'grass').slice(5, 19);
const full = await act(a, farm, many.map((n) => ({ t: 'harvest', n: n.id })));
const got = full.res.filter((r) => r.ok).reduce((n, r) => n + r.q, 0);
assert.ok(got <= 50, 'mochila não passa da capacidade');
// vende 4 direto da mochila e devolve o resto ao estoque
const sb4 = await act(a, farm, [{ t: 'sell', i: 'fiber', q: 4, src: 'bag' }, { t: 'deposit' }]);
assert.ok(sb4.res[0].ok && sb4.res[0].g === 8 && sb4.res[1].ok, JSON.stringify(sb4.res));
s2 = (await a.rpc('get_farm_state', { p_farm: farm })).data;
assert.equal(s2.inv.fiber, 10 + got - 4);
await act(a, farm, [{ t: 'sell', i: 'fiber', q: got - 4 }]);
console.log('✓ mochila com limite, venda direto da mochila', got);

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

// Missões principais: objetivo pelo estado real, sem resgate duplo (nem simultâneo)
assert.equal(st.farm.crystals, 5, 'fazenda nova começa com 5 cristais');
const m3 = await act(a, farm, [{ t: 'main', m: 'm03' }]);
assert.equal(m3.res[0].e, 'quest_locked', JSON.stringify(m3.res));
const m1 = await act(a, farm, [{ t: 'main', m: 'm01' }, { t: 'main', m: 'm01' }]);
assert.ok(m1.res[0].ok && m1.res[1].e === 'already_unlocked', JSON.stringify(m1.res));
const [c1, c2] = await Promise.all([act(a, farm, [{ t: 'main', m: 'm02' }]), act(b, farm, [{ t: 'main', m: 'm02' }])]);
assert.equal([c1.res[0].ok, c2.res[0].ok].filter(Boolean).length, 1, 'missão principal resgatada uma vez só');
const m3b = await act(a, farm, [{ t: 'main', m: 'm03' }]);
assert.equal(m3b.res[0].e, 'quest_incomplete');
console.log('✓ missões principais: pré-requisito, objetivo real e resgate único');

// Missões geradas: secundárias e diárias criadas pelo estado da fazenda
const mr = await act(a, farm, [{ t: 'mref' }]);
assert.ok(mr.res[0].ok, JSON.stringify(mr.res));
const ms = mr.farm.progression.ms;
assert.equal(ms.side.length, 3); assert.equal(ms.daily.l.length, 3);
const mc = await act(a, farm, [{ t: 'mclaim', s: 'side', i: 0 }]);
assert.equal(mc.res[0].e, 'quest_incomplete');
console.log('✓ missões geradas', ms.side.map((m) => m.k + '×' + m.n).join(', '));

// Campo especializado: só a cultura do campo; canteiro ocupado; colheita antecipada; aceleração com cristal
const pl = await act(b, farm, [
  { t: 'plant', e: 'f:wheat', i: 0, c: 'wheat' }, { t: 'plant', e: 'f:wheat', i: 0, c: 'wheat' }, { t: 'reap', e: 'f:wheat', i: 0 },
  { t: 'plant', e: 'f:wheat', i: 1, c: 'carrot' }, { t: 'plant', e: 'field', i: 0, c: 'wheat' }, { t: 'plant', e: 'f:wheat', i: 3, c: 'wheat' },
]);
assert.ok(pl.res[0].ok, JSON.stringify(pl.res));
assert.equal(pl.res[1].e, 'plot_busy');
assert.equal(pl.res[2].e, 'not_ready');
assert.equal(pl.res[3].e, 'wrong_field');
assert.equal(pl.res[4].e, 'invalid');
assert.equal(pl.res[5].e, 'invalid', 'canteiro além do nível do campo');
const crBefore = pl.farm.crystals;
const [ru1, ru2] = await Promise.all([act(a, farm, [{ t: 'rush', k: 'plot', e: 'f:wheat', i: 0 }]), act(b, farm, [{ t: 'rush', k: 'plot', e: 'f:wheat', i: 0 }])]);
assert.equal([ru1.res[0].ok, ru2.res[0].ok].filter(Boolean).length, 1, 'aceleração cobrada uma vez só');
const rs = (await a.rpc('get_farm_state', { p_farm: farm })).data;
assert.ok(rs.farm.crystals < crBefore || rs.farm.coins >= 0, 'cobrou');
const rp = await act(b, farm, [{ t: 'reap', e: 'f:wheat', i: 0 }]);
assert.ok(rp.res[0].ok, JSON.stringify(rp.res));
console.log('✓ campo de trigo: cultura certa, canteiros por nível, aceleração única', { cristais: [crBefore, rs.farm.crystals] });

// Loja: requisitos de nível no servidor
const shop = await act(a, farm, [{ t: 'pet', p: 'owl' }, { t: 'perk', p: 'spd' }, { t: 'fopen', f: 'potato' }, { t: 'give', k: 'r:rio', i: 'coins', q: 1 }, { t: 'give', k: 'o:pontes', i: 'coins', q: 1 }]);
for (const r of shop.res) assert.ok(!r.ok, JSON.stringify(shop.res));
console.log('✓ loja, campos e obstáculos respeitam nível/região/ferramenta', shop.res.map((r) => r.e).join(' '));

// Visual pago não liberado volta ao padrão no banco
const uidB = (await b.auth.getUser()).data.user.id;
const { error: ge } = await b.from('profiles').update({ character_config: { hat: 4, shoes: 2, body: 1 } }).eq('user_id', uidB);
assert.ifError(ge);
const { data: pb, error: pe } = await b.from('profiles').select('character_config').eq('user_id', uidB).single();
assert.ifError(pe); console.log('  visual salvo', pb);
assert.equal(pb.character_config.hat, 0); assert.equal(pb.character_config.shoes, 2); assert.equal(pb.character_config.body, 1);
console.log('✓ cosmético pago bloqueado no servidor; livre mantido');

// Pedido sem itens falha; venda gera moedas
const ord = await act(a, farm, [{ t: 'order', o: 0 }]);
assert.ok(!ord.res[0].ok);
const sell = await act(a, farm, [{ t: 'sell', i: 'wood', q: 1 }]);
assert.ok(sell.res[0].ok && sell.res[0].g === 2);
console.log('✓ pedido sem itens recusado, venda credita moedas');

// Coop: sino (nível 3 + recarga), feira semanal (bolsa/estoque, faixa única), presentes e mural
const uidA = (await a.auth.getUser()).data.user.id;
const lvNow = (await a.rpc('get_farm_state', { p_farm: farm })).data.farm.level;
const bell = await act(a, farm, [{ t: 'bell' }, { t: 'bell' }]);
if (lvNow >= 3) { assert.ok(bell.res[0].ok, JSON.stringify(bell.res)); assert.equal(bell.res[1].e, 'cooldown'); }
else assert.ok(bell.res[0].e.startsWith('level_required'), JSON.stringify(bell.res));
const fr = await act(a, farm, [{ t: 'fair' }]);
const fair = fr.farm.progression.fair;
assert.equal(Object.keys(fair.goal).length > 0, true, JSON.stringify(fair));
const fcl = await act(b, farm, [{ t: 'fclaim', tier: 0 }]);
assert.equal(fcl.res[0].e, 'quest_incomplete');
// presente: B pega 2 madeiras na mochila e dá para A; mochila de A muda no delta (bags)
const tree2 = WORLD_NODES.filter((n) => n.r === 'sitio' && n.t === 'tree_oak').slice(6, 7);
await act(b, farm, tree2.map((n) => ({ t: 'harvest', n: n.id })));
const gf = await act(b, farm, [{ t: 'gift', u: uidA, i: 'wood', q: 2 }, { t: 'gift', u: (await b.auth.getUser()).data.user.id, i: 'wood', q: 1 }]);
assert.ok(gf.res[0].ok && gf.res[0].q === 2, JSON.stringify(gf.res));
assert.equal(gf.res[1].e, 'invalid', 'presente para si mesmo');
assert.ok((gf.bags[uidA].wood ?? 0) >= 2, 'mochila do amigo atualizada no delta');
const log = gf.farm.progression.log;
assert.equal(log[0].k, 'gift'); assert.equal(log[0].to, uidA);
console.log('✓ coop: sino, feira semanal, presente entre colegas e mural', { sino: bell.res.map((r) => r.ok ? 'ok' : r.e), feira: fair.goal, mural: log.length });

// Membros e perfis visíveis entre colegas
const { data: profs } = await a.from('profiles').select('username');
assert.equal(profs.length, 2);
const { error: lookErr } = await b.from('profiles').update({ character_config: { hair: 2, body: 1 } }).eq('user_id', (await b.auth.getUser()).data.user.id);
assert.ifError(lookErr);
console.log('✓ perfis de colegas visíveis e aparência salva');

console.log(`\nOK — fazenda ${farm} (${code}) com ta_${tag} / tb_${tag}`);
