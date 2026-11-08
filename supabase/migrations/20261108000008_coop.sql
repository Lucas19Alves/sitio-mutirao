-- v1.2: recursos cooperativos.
--  * Sino do Mutirão: qualquer membro toca o sino da Casa da Fazenda; por 10 min todos colhem com bônus.
--  * Feira da Vila: meta semanal da fazenda inteira (3 produtos), com 3 faixas de prêmio.
--  * Presentes: passar itens da sua mochila para a mochila de um colega.
--  * Mural: as últimas conquistas da fazenda (quem fez o quê), para todos verem.
-- Tudo dentro do farm_act (trava por fazenda, idempotente por lote). Sem colunas novas: o estado
-- fica em farms.progression (bell, fair, log).

-- ================================================================ sino do mutirão
create or replace function game.bell_on(p_farm uuid, p_now bigint) returns boolean language sql stable set search_path = '' as $$
  select coalesce((progression -> 'bell' ->> 'until')::bigint, 0) > p_now from public.farms where id = p_farm
$$;

create or replace function game.act_bell(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_b jsonb; v_cfg jsonb := p_cat -> 'coop' -> 'bell';
begin
  select coalesce(progression -> 'bell', '{}'::jsonb) into v_b from public.farms where id = p_farm;
  if coalesce((v_b ->> 'next')::bigint, 0) > p_now then raise exception 'cooldown'; end if;
  perform game.require_level(p_farm, (v_cfg ->> 'level')::int);
  update public.farms set progression = jsonb_set(progression, '{bell}', jsonb_build_object(
      'until', p_now + (v_cfg ->> 'ms')::bigint, 'next', p_now + (v_cfg ->> 'cooldown')::bigint, 'by', p_uid)) where id = p_farm;
  perform game.stat(p_farm, p_uid, 'bell', 1);
  return jsonb_build_object('until', p_now + (v_cfg ->> 'ms')::bigint);
end $$;

/** +1 com a chance do sino enquanto ele está tocando. */
create or replace function game.bell_bonus(p_farm uuid, p_now bigint, p_cat jsonb) returns int language plpgsql stable set search_path = '' as $$
begin
  if game.bell_on(p_farm, p_now) and random() < (p_cat -> 'coop' -> 'bell' ->> 'chance')::numeric then return 1; end if;
  return 0;
end $$;

create or replace function game.act_reap(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_e text := a ->> 'e'; v_i int := (a ->> 'i')::int; v_p jsonb; v_slot jsonb; v_c text; v_cr jsonb;
  v_q int; v_tier int; v_prog jsonb; v_fit int; v_l int;
begin
  select state -> 'p' into v_p from public.farm_entities where farm_id = p_farm and entity_key = v_e;
  v_slot := v_p -> v_i;
  if v_slot is null or jsonb_typeof(v_slot) = 'null' then raise exception 'plot_empty'; end if;
  v_c := v_slot ->> 0;
  v_cr := p_cat -> 'crops' -> v_c;
  if p_now + 1000 < (v_slot ->> 1)::bigint + ((v_cr ->> 'time')::numeric * 1000 * game.grow_mult(p_farm, v_e, p_cat))::bigint then raise exception 'not_ready'; end if;
  v_q := (v_cr ->> 'yield')::int;
  if v_e like 'f:%' then
    v_l := greatest(1, game.lvl(p_farm, v_e));
    v_q := v_q + (p_cat -> 'fields' -> substr(v_e, 3) -> 'yield' ->> (v_l - 1))::int;
  end if;
  if v_cr ->> 'tool' is not null then
    select progression into v_prog from public.farms where id = p_farm;
    v_tier := coalesce((v_prog -> 'tools' ->> (v_cr ->> 'tool'))::int, 0);
    if v_tier < 1 then raise exception 'tool_required:%:1', v_cr ->> 'tool'; end if;
    v_q := v_q + v_tier - 1;
  end if;
  if random() < game.pet_bonus(p_farm, p_uid, 'harvest', p_cat) then v_q := v_q + 1; end if;
  v_q := v_q + game.bell_bonus(p_farm, p_now, p_cat);
  v_fit := game.bag_put(p_farm, p_uid, v_c, v_q, p_cat);
  if v_fit = 0 then raise exception 'bag_full'; end if;
  update public.farm_entities set state = jsonb_set(state, array['p', v_i::text], 'null'::jsonb) where farm_id = p_farm and entity_key = v_e;
  perform game.add_xp(p_farm, (v_cr ->> 'xp')::int, p_cat);
  perform game.stat(p_farm, p_uid, 'h:' || v_c, v_fit, 'harvest');
  perform game.pet_xp(p_farm, p_uid, 1);
  return jsonb_build_object('e', jsonb_build_array(v_e), 'q', v_fit, 'item', v_c, 'bag', true);
end $$;

create or replace function game.act_harvest(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'n'; v_w jsonb; v_nd jsonb; v_prog jsonb; v_nodes jsonb; v_tier int; v_req int; v_q int; v_item text; v_fit int;
begin
  v_w := p_cat -> 'world' -> v_id;
  if v_w is null then raise exception 'invalid'; end if;
  v_nd := p_cat -> 'nodes' -> (v_w ->> 't');
  select progression, nodes into v_prog, v_nodes from public.farms where id = p_farm;
  if not (v_prog -> 'regions') ? (v_w ->> 'r') then raise exception 'region_locked'; end if;
  if coalesce((v_nodes ->> v_id)::bigint, 0) > p_now then raise exception 'node_depleted'; end if;
  v_req := (v_nd ->> 'tier')::int;
  v_q := (v_nd ->> 'qty')::int;
  v_item := v_nd ->> 'item';
  if v_nd ->> 'tool' is not null then
    v_tier := coalesce((v_prog -> 'tools' ->> (v_nd ->> 'tool'))::int, 0);
    if v_tier < v_req then raise exception 'tool_required:%:%', v_nd ->> 'tool', v_req; end if;
    v_q := v_q + (v_tier - v_req);
  end if;
  if random() < game.pet_bonus(p_farm, p_uid, 'gather', p_cat) then v_q := v_q + 1; end if;
  v_q := v_q + game.bell_bonus(p_farm, p_now, p_cat);
  v_fit := game.bag_put(p_farm, p_uid, v_item, v_q, p_cat);
  if v_fit = 0 then raise exception 'bag_full'; end if;
  update public.farms set nodes = jsonb_set(nodes, array[v_id], to_jsonb(p_now + (v_nd ->> 'respawn')::bigint * 1000)) where id = p_farm;
  perform game.add_xp(p_farm, (v_nd ->> 'xp')::int, p_cat);
  perform game.stat(p_farm, p_uid, 'h:' || v_item, v_fit, 'harvest');
  perform game.pet_xp(p_farm, p_uid, 1);
  return jsonb_build_object('q', v_fit, 'item', v_item, 'bag', true);
end $$;

-- ================================================================ feira da vila (meta semanal coletiva)
create or replace function game.fair_week() returns text language sql stable set search_path = '' as $$
  select to_char(now() at time zone 'America/Sao_Paulo', 'IYYY-IW')
$$;

/** Garante a feira da semana: 3 produtos que a fazenda já consegue fazer, meta pelo nível e membros. */
create or replace function game.fair_ensure(p_farm uuid, p_cat jsonb) returns jsonb language plpgsql set search_path = '' as $$
declare v_f jsonb; v_lv int; v_prog jsonb; v_members int; v_cand text[]; v_pick text[]; v_it text; v_goal jsonb := '{}'::jsonb; v_val numeric; v_price int; v_q int;
begin
  select level, progression into v_lv, v_prog from public.farms where id = p_farm;
  v_f := v_prog -> 'fair';
  if v_f is not null and v_f ->> 'w' = game.fair_week() then return v_f; end if;
  select greatest(1, count(*)) into v_members from public.farm_members where farm_id = p_farm;
  -- preferência por produtos (receitas); se não houver, qualquer item obtível
  select array_agg(e.key) into v_cand from jsonb_each(p_cat -> 'items') e
    where p_cat -> 'recipes' ? e.key and game.item_ok(p_farm, e.key, p_cat, v_lv, v_prog);
  if coalesce(array_length(v_cand, 1), 0) < 3 then
    select array_agg(e.key) into v_cand from jsonb_each(p_cat -> 'items') e where game.item_ok(p_farm, e.key, p_cat, v_lv, v_prog);
  end if;
  select array_agg(x) into v_pick from (select x from unnest(v_cand) x order by random() limit 3) s;
  v_val := ((p_cat -> 'coop' -> 'fair' ->> 'base')::numeric + v_lv * (p_cat -> 'coop' -> 'fair' ->> 'perLevel')::numeric) * (0.6 + 0.4 * v_members);
  foreach v_it in array coalesce(v_pick, '{}') loop
    v_price := (p_cat -> 'items' -> v_it ->> 'price')::int;
    v_q := greatest(3, least(200, round(v_val / greatest(1, array_length(v_pick, 1)) / v_price)::int));
    v_goal := v_goal || jsonb_build_object(v_it, v_q);
  end loop;
  v_f := jsonb_build_object('w', game.fair_week(), 'goal', v_goal, 'got', '{}'::jsonb, 'by', '{}'::jsonb, 'claimed', '[]'::jsonb);
  update public.farms set progression = jsonb_set(progression, '{fair}', v_f) where id = p_farm;
  return v_f;
end $$;

create or replace function game.fair_pct(p_f jsonb, p_cat jsonb) returns numeric language sql immutable set search_path = '' as $$
  select coalesce(sum(least(g.value::int, coalesce((p_f -> 'got' ->> g.key)::int, 0)) * (p_cat -> 'items' -> g.key ->> 'price')::int)::numeric
         / nullif(sum(g.value::int * (p_cat -> 'items' -> g.key ->> 'price')::int), 0), 0)
  from jsonb_each_text(p_f -> 'goal') g
$$;

create or replace function game.act_fair(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
begin
  perform game.fair_ensure(p_farm, p_cat);
  return '{}'::jsonb;
end $$;

/** Entregar para a feira: usa a mochila primeiro, depois o estoque. */
create or replace function game.act_fgive(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_f jsonb := game.fair_ensure(p_farm, p_cat); v_i text := a ->> 'i'; v_q int := (a ->> 'q')::int; v_need int; v_got int; v_have int; v_take int; v_val int;
begin
  v_need := (v_f -> 'goal' ->> v_i)::int;
  if v_need is null or v_q is null or v_q < 1 then raise exception 'invalid'; end if;
  v_got := coalesce((v_f -> 'got' ->> v_i)::int, 0);
  if v_got >= v_need then raise exception 'not_needed'; end if;
  v_q := least(v_q, v_need - v_got);
  select coalesce((bag ->> v_i)::int, 0) into v_have from public.farm_members where farm_id = p_farm and user_id = p_uid;
  v_take := least(v_have, v_q);
  if v_take > 0 then perform game.bag_take(p_farm, p_uid, v_i, v_take); end if;
  if v_q - v_take > 0 then perform game.inv_take(p_farm, v_i, v_q - v_take); end if;
  v_val := v_q * (p_cat -> 'items' -> v_i ->> 'price')::int;
  v_f := jsonb_set(v_f, array['got', v_i], to_jsonb(v_got + v_q));
  v_f := jsonb_set(v_f, array['by', p_uid::text], to_jsonb(coalesce((v_f -> 'by' ->> p_uid::text)::int, 0) + v_val));
  update public.farms set progression = jsonb_set(progression, '{fair}', v_f) where id = p_farm;
  perform game.add_xp(p_farm, greatest(1, round(v_val * 0.08)::int), p_cat);
  perform game.stat(p_farm, p_uid, 'fair', v_val, 'give');
  return jsonb_build_object('i', jsonb_build_array(v_i), 'q', v_q, 'pct', round(game.fair_pct(v_f, p_cat) * 100));
end $$;

/** Receber uma faixa da feira (uma vez por semana para a fazenda toda). */
create or replace function game.act_fclaim(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_f jsonb := game.fair_ensure(p_farm, p_cat); v_t int := (a ->> 'tier')::int; v_tier jsonb; v_total numeric; v_coop boolean; v_coins int; v_lv int; v_cr int;
begin
  v_tier := p_cat -> 'coop' -> 'fair' -> 'tiers' -> v_t;
  if v_tier is null then raise exception 'invalid'; end if;
  if (v_f -> 'claimed') ? v_t::text then raise exception 'already_claimed'; end if;
  if game.fair_pct(v_f, p_cat) < (v_tier ->> 'pct')::numeric then raise exception 'quest_incomplete'; end if;
  select level into v_lv from public.farms where id = p_farm;
  select coalesce(sum(value::numeric), 0) into v_total from jsonb_each_text(v_f -> 'by');
  v_coop := (select count(*) from jsonb_each_text(v_f -> 'by') where value::numeric >= v_total * (p_cat -> 'config' ->> 'coopMinShare')::numeric) >= 2;
  v_coins := round(((v_tier ->> 'coins')::int + v_lv * (v_tier ->> 'perLevel')::int) * case when v_coop then 1.25 else 1 end)::int;
  v_cr := (v_tier ->> 'cr')::int + case when v_coop then 1 else 0 end;
  update public.farms set coins = coins + v_coins, crystals = crystals + v_cr, reputation = reputation + (v_tier ->> 'rep')::int,
    progression = jsonb_set(progression, '{fair,claimed}', (v_f -> 'claimed') || to_jsonb(v_t::text)) where id = p_farm;
  perform game.add_xp(p_farm, (v_tier ->> 'xp')::int + v_lv * 4, p_cat);
  return jsonb_build_object('g', v_coins, 'cr', v_cr, 'coop', v_coop);
end $$;

-- ================================================================ presentes entre colegas
create or replace function game.act_gift(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_to uuid := (a ->> 'u')::uuid; v_i text := a ->> 'i'; v_q int := (a ->> 'q')::int; v_have int; v_fit int;
begin
  if v_to is null or v_to = p_uid or v_q is null or v_q < 1 or p_cat -> 'items' -> v_i is null then raise exception 'invalid'; end if;
  if not exists (select 1 from public.farm_members where farm_id = p_farm and user_id = v_to) then raise exception 'invalid'; end if;
  select coalesce((bag ->> v_i)::int, 0) into v_have from public.farm_members where farm_id = p_farm and user_id = p_uid;
  if v_have < 1 then raise exception 'missing_item:%:%', v_i, v_q; end if;
  v_q := least(v_q, v_have);
  v_fit := game.bag_put(p_farm, v_to, v_i, v_q, p_cat);
  if v_fit = 0 then raise exception 'friend_bag_full'; end if;
  perform game.bag_take(p_farm, p_uid, v_i, v_fit);
  perform game.stat(p_farm, p_uid, 'gift', v_fit, 'gift');
  return jsonb_build_object('q', v_fit, 'item', v_i, 'to', v_to);
end $$;

-- ================================================================ despacho
create or replace function game.do_action(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
begin
  return case a ->> 't'
    when 'harvest' then game.act_harvest(p_farm, p_uid, a, p_cat, p_now)
    when 'plant' then game.act_plant(p_farm, p_uid, a, p_cat, p_now)
    when 'reap' then game.act_reap(p_farm, p_uid, a, p_cat, p_now)
    when 'craft' then game.act_craft(p_farm, p_uid, a, p_cat, p_now)
    when 'collect' then game.act_collect(p_farm, p_uid, a, p_cat, p_now)
    when 'sell' then game.act_sell(p_farm, p_uid, a, p_cat, p_now)
    when 'tool' then game.act_tool(p_farm, p_uid, a, p_cat, p_now)
    when 'give' then game.act_give(p_farm, p_uid, a, p_cat, p_now)
    when 'order' then game.act_order(p_farm, p_uid, a, p_cat, p_now)
    when 'skip' then game.act_skip(p_farm, p_uid, a, p_cat, p_now)
    when 'cgive' then game.act_cgive(p_farm, p_uid, a, p_cat, p_now)
    when 'deposit' then game.act_deposit(p_farm, p_uid, a, p_cat, p_now)
    when 'bag' then game.act_bag(p_farm, p_uid, a, p_cat, p_now)
    when 'hire' then game.act_hire(p_farm, p_uid, a, p_cat, p_now)
    when 'wclaim' then game.act_wclaim(p_farm, p_uid, a, p_cat, p_now)
    when 'main' then game.act_main(p_farm, p_uid, a, p_cat, p_now)
    when 'mref' then game.act_mref(p_farm, p_uid, a, p_cat, p_now)
    when 'mclaim' then game.act_mclaim(p_farm, p_uid, a, p_cat, p_now)
    when 'fopen' then game.act_fopen(p_farm, p_uid, a, p_cat, p_now)
    when 'fup' then game.act_fup(p_farm, p_uid, a, p_cat, p_now)
    when 'rush' then game.act_rush(p_farm, p_uid, a, p_cat, p_now)
    when 'pet' then game.act_pet(p_farm, p_uid, a, p_cat, p_now)
    when 'peq' then game.act_peq(p_farm, p_uid, a, p_cat, p_now)
    when 'perk' then game.act_perk(p_farm, p_uid, a, p_cat, p_now)
    when 'cosm' then game.act_cosm(p_farm, p_uid, a, p_cat, p_now)
    when 'bell' then game.act_bell(p_farm, p_uid, a, p_cat, p_now)
    when 'fair' then game.act_fair(p_farm, p_uid, a, p_cat, p_now)
    when 'fgive' then game.act_fgive(p_farm, p_uid, a, p_cat, p_now)
    when 'fclaim' then game.act_fclaim(p_farm, p_uid, a, p_cat, p_now)
    when 'gift' then game.act_gift(p_farm, p_uid, a, p_cat, p_now)
  end;
end $$;

-- ================================================================ mural: conquistas no farm_act
/** Item do mural para uma ação bem-sucedida (ou null se não vale registrar). */
create or replace function game.log_entry(a jsonb, r jsonb, p_uid uuid, p_now bigint) returns jsonb language sql immutable set search_path = '' as $$
  select case
    when a ->> 't' = 'order' then jsonb_build_object('k', 'order', 'x', r ->> 'npc', 'g', r -> 'g')
    when a ->> 't' = 'main' then jsonb_build_object('k', 'main', 'x', a ->> 'm')
    when a ->> 't' in ('fopen', 'fup') then jsonb_build_object('k', a ->> 't', 'x', a ->> 'f')
    when a ->> 't' = 'give' and coalesce((r ->> 'done')::boolean, false) then jsonb_build_object('k', 'built', 'x', a ->> 'k', 'coop', r -> 'coop')
    when a ->> 't' = 'pet' then jsonb_build_object('k', 'pet', 'x', a ->> 'p')
    when a ->> 't' = 'tool' then jsonb_build_object('k', 'tool', 'x', a ->> 'tool')
    when a ->> 't' = 'mclaim' then jsonb_build_object('k', 'mission', 'x', a ->> 's')
    when a ->> 't' = 'bell' then jsonb_build_object('k', 'bell')
    when a ->> 't' = 'fgive' then jsonb_build_object('k', 'fair', 'x', a ->> 'i', 'q', r -> 'q')
    when a ->> 't' = 'fclaim' then jsonb_build_object('k', 'fairtier', 'x', a ->> 'tier')
    when a ->> 't' = 'gift' then jsonb_build_object('k', 'gift', 'x', r ->> 'item', 'q', r -> 'q', 'to', r ->> 'to')
    when a ->> 't' = 'hire' then jsonb_build_object('k', 'hire', 'x', a ->> 'w')
  end || jsonb_build_object('u', p_uid, 'at', p_now)
$$;

create or replace function public.farm_act(p_farm uuid, p_batch uuid, p_actions jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_cat jsonb; v_now bigint; a jsonb; v_res jsonb := '[]'::jsonb; v_chg jsonb;
  v_inv text[] := '{}'; v_ents text[] := '{}'; v_ords int[] := '{}'; v_last uuid; v_rev bigint; v_delta jsonb;
  v_msg text; v_okn int := 0; v_log jsonb := '[]'::jsonb; v_le jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_batch is null or jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions) = 0
     or jsonb_array_length(p_actions) > 40 then raise exception 'invalid_batch'; end if;
  if not game.is_member(p_farm) then raise exception 'not_member'; end if;

  perform 1 from public.farms where id = p_farm for update;
  select last_batch into v_last from public.farm_members where farm_id = p_farm and user_id = v_uid;
  if v_last = p_batch then
    return jsonb_build_object('dup', true, 'rev', (select rev from public.farms where id = p_farm));
  end if;

  v_cat := game.cat();
  v_now := game.now_ms();
  for a in select value from jsonb_array_elements(p_actions) loop
    begin
      v_chg := game.do_action(p_farm, v_uid, a, v_cat, v_now);
      if v_chg is null then raise exception 'invalid'; end if;
      v_inv := v_inv || coalesce(array(select jsonb_array_elements_text(coalesce(v_chg -> 'i', '[]'::jsonb))), '{}');
      v_ents := v_ents || coalesce(array(select jsonb_array_elements_text(coalesce(v_chg -> 'e', '[]'::jsonb))), '{}');
      v_ords := v_ords || coalesce(array(select jsonb_array_elements_text(coalesce(v_chg -> 'o', '[]'::jsonb))::int), '{}');
      v_res := v_res || jsonb_build_array(jsonb_build_object('ok', true) || (v_chg - 'i' - 'e' - 'o'));
      v_okn := v_okn + 1;
      v_le := game.log_entry(a, v_chg, v_uid, v_now);
      if v_le ? 'k' then v_log := v_log || jsonb_build_array(v_le); end if;
    exception when others then
      v_msg := sqlerrm;
      if v_msg !~ '^[a-z_]+(:[a-z0-9_]+)*$' then
        raise warning 'farm_act % falhou: %', a, sqlerrm;
        v_msg := 'error';
      end if;
      v_res := v_res || jsonb_build_array(jsonb_build_object('ok', false, 'e', v_msg));
    end;
  end loop;

  update public.farm_members set last_batch = p_batch where farm_id = p_farm and user_id = v_uid;
  if v_okn = 0 then
    return jsonb_build_object('rev', (select rev from public.farms where id = p_farm), 'now', v_now, 'res', v_res, 'noop', true);
  end if;

  -- mural: as 30 conquistas mais recentes (as novas na frente)
  if jsonb_array_length(v_log) > 0 then
    update public.farms set progression = jsonb_set(progression, '{log}', (
      select coalesce(jsonb_agg(x.v order by x.n), '[]'::jsonb) from (
        select v, n from jsonb_array_elements(v_log || coalesce(progression -> 'log', '[]'::jsonb)) with ordinality t(v, n) order by n limit 30
      ) x)) where id = p_farm;
  end if;

  update public.farms
    set nodes = coalesce((select jsonb_object_agg(key, value) from jsonb_each(nodes) where (value #>> '{}')::bigint > v_now), '{}'::jsonb),
        rev = rev + 1, updated_at = now()
    where id = p_farm returning rev into v_rev;
  v_delta := game.delta(p_farm, v_rev, v_uid, v_now, v_inv, v_ents, v_ords);
  perform realtime.send(v_delta, 'sync', 'farm:' || p_farm::text, true);
  return v_delta || jsonb_build_object('res', v_res);
end $$;

revoke all on all functions in schema game from public, anon, authenticated;
grant execute on function game.is_member(uuid), game.shares_farm(uuid), game.topic_member(text) to authenticated;
revoke all on function public.farm_act(uuid, uuid, jsonb) from public, anon;
grant execute on function public.farm_act(uuid, uuid, jsonb) to authenticated;

-- ================================================================ delta: mochilas de todos (presentes mudam a de outro membro)
create or replace function game.delta(p_farm uuid, p_rev bigint, p_uid uuid, p_now bigint, p_inv text[], p_ents text[], p_ords int[]) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'rev', p_rev, 'by', p_uid, 'now', p_now,
    'farm', (select jsonb_build_object('level', f.level, 'xp', f.xp, 'coins', f.coins, 'crystals', f.crystals, 'reputation', f.reputation,
                                       'progression', f.progression, 'nodes', f.nodes) from public.farms f where f.id = p_farm),
    'inv', (select coalesce(jsonb_object_agg(s.i, coalesce(fi.quantity, 0)), '{}'::jsonb)
            from (select distinct unnest(p_inv) as i) s
            left join public.farm_inventory fi on fi.farm_id = p_farm and fi.item_id = s.i),
    'ents', (select coalesce(jsonb_agg(jsonb_build_object('k', e.entity_key, 'kind', e.kind, 'level', e.level, 'state', e.state)), '[]'::jsonb)
             from public.farm_entities e where e.farm_id = p_farm and e.entity_key = any (p_ents)),
    'gone', (select coalesce(jsonb_agg(k), '[]'::jsonb) from unnest(p_ents) k
             where not exists (select 1 from public.farm_entities e where e.farm_id = p_farm and e.entity_key = k)),
    'orders', (select coalesce(jsonb_agg(to_jsonb(o) - 'farm_id'), '[]'::jsonb)
               from public.farm_orders o where o.farm_id = p_farm and o.slot = any (p_ords)),
    'member', (select jsonb_build_object('user_id', m.user_id, 'stats', m.stats, 'bag', m.bag, 'bag_tier', m.bag_tier, 'pets', m.pets, 'perks', m.perks, 'owned', p.owned)
               from public.farm_members m join public.profiles p on p.user_id = m.user_id
               where m.farm_id = p_farm and m.user_id = p_uid),
    'bags', (select coalesce(jsonb_object_agg(m.user_id, m.bag), '{}'::jsonb) from public.farm_members m where m.farm_id = p_farm)
  )
$$;
revoke all on function game.delta(uuid, bigint, uuid, bigint, text[], text[], int[]) from public, anon, authenticated;
