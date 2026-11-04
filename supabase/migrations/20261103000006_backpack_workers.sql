-- v1.0: mochila por jogador, depósito no celeiro, venda direto da mochila, melhorias de
-- mochila e ajudantes que produzem com o tempo. Tudo passa pelo farm_act (lock por fazenda).

alter table public.farm_members
  add column if not exists bag jsonb not null default '{}'::jsonb,
  add column if not exists bag_tier int not null default 0 check (bag_tier >= 0);

-- ---------------------------------------------------------------- utilitários
create or replace function game.bag_total(p_bag jsonb) returns int language sql immutable set search_path = '' as $$
  select coalesce(sum(value::int), 0)::int from jsonb_each_text(coalesce(p_bag, '{}'::jsonb))
$$;

create or replace function game.inv_space(p_farm uuid, p_cat jsonb) returns int language sql stable set search_path = '' as $$
  select game.capacity(p_farm, p_cat) - coalesce((select sum(quantity) from public.farm_inventory where farm_id = p_farm), 0)::int
$$;

-- Põe até p_q unidades na mochila; devolve quanto coube (0 = cheia).
create or replace function game.bag_put(p_farm uuid, p_uid uuid, p_item text, p_q int, p_cat jsonb) returns int language plpgsql set search_path = '' as $$
declare v_bag jsonb; v_tier int; v_cap int; v_fit int;
begin
  select bag, bag_tier into v_bag, v_tier from public.farm_members where farm_id = p_farm and user_id = p_uid;
  if v_bag is null then raise exception 'not_member'; end if;
  v_cap := (p_cat -> 'config' -> 'bagCap' ->> least(v_tier, jsonb_array_length(p_cat -> 'config' -> 'bagCap') - 1))::int;
  v_fit := least(p_q, v_cap - game.bag_total(v_bag));
  if v_fit <= 0 then return 0; end if;
  update public.farm_members
    set bag = jsonb_set(bag, array[p_item], to_jsonb(coalesce((bag ->> p_item)::int, 0) + v_fit), true)
    where farm_id = p_farm and user_id = p_uid;
  return v_fit;
end $$;

create or replace function game.bag_take(p_farm uuid, p_uid uuid, p_item text, p_q int) returns void language plpgsql set search_path = '' as $$
declare v_have int;
begin
  if p_q is null or p_q <= 0 then raise exception 'invalid_qty'; end if;
  select coalesce((bag ->> p_item)::int, 0) into v_have from public.farm_members where farm_id = p_farm and user_id = p_uid;
  if coalesce(v_have, 0) < p_q then raise exception 'missing_item:%:%', p_item, p_q; end if;
  update public.farm_members
    set bag = case when v_have = p_q then bag - p_item else jsonb_set(bag, array[p_item], to_jsonb(v_have - p_q)) end
    where farm_id = p_farm and user_id = p_uid;
end $$;

-- ---------------------------------------------------------------- coleta agora enche a mochila
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
  v_fit := game.bag_put(p_farm, p_uid, v_item, v_q, p_cat);
  if v_fit = 0 then raise exception 'bag_full'; end if;
  update public.farms set nodes = jsonb_set(nodes, array[v_id], to_jsonb(p_now + (v_nd ->> 'respawn')::bigint * 1000)) where id = p_farm;
  perform game.add_xp(p_farm, (v_nd ->> 'xp')::int, p_cat);
  perform game.stat(p_farm, p_uid, 'h:' || v_item, v_fit, 'harvest');
  return jsonb_build_object('q', v_fit, 'item', v_item, 'bag', true);
end $$;

create or replace function game.act_reap(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_e text := a ->> 'e'; v_i int := (a ->> 'i')::int; v_p jsonb; v_slot jsonb; v_c text; v_cr jsonb;
  v_mult numeric := 1; v_well int; v_q int; v_tier int; v_prog jsonb; v_fit int;
begin
  select state -> 'p' into v_p from public.farm_entities where farm_id = p_farm and entity_key = v_e;
  v_slot := v_p -> v_i;
  if v_slot is null or jsonb_typeof(v_slot) = 'null' then raise exception 'plot_empty'; end if;
  v_c := v_slot ->> 0;
  v_cr := p_cat -> 'crops' -> v_c;
  v_well := game.lvl(p_farm, 'well');
  if v_well > 0 then v_mult := 1 - (p_cat -> 'config' -> 'wellBonus' ->> (v_well - 1))::numeric; end if;
  if v_e = 'greenhouse' then v_mult := v_mult * (p_cat -> 'config' ->> 'greenhouseSpeed')::numeric; end if;
  if p_now + 1000 < (v_slot ->> 1)::bigint + ((v_cr ->> 'time')::numeric * 1000 * v_mult)::bigint then raise exception 'not_ready'; end if;
  v_q := (v_cr ->> 'yield')::int;
  if v_cr ->> 'tool' is not null then
    select progression into v_prog from public.farms where id = p_farm;
    v_tier := coalesce((v_prog -> 'tools' ->> (v_cr ->> 'tool'))::int, 0);
    if v_tier < 1 then raise exception 'tool_required:%:1', v_cr ->> 'tool'; end if;
    v_q := v_q + v_tier - 1;
  end if;
  v_fit := game.bag_put(p_farm, p_uid, v_c, v_q, p_cat);
  if v_fit = 0 then raise exception 'bag_full'; end if;
  update public.farm_entities set state = jsonb_set(state, array['p', v_i::text], 'null'::jsonb) where farm_id = p_farm and entity_key = v_e;
  perform game.add_xp(p_farm, (v_cr ->> 'xp')::int, p_cat);
  perform game.stat(p_farm, p_uid, 'h:' || v_c, v_fit, 'harvest');
  return jsonb_build_object('e', jsonb_build_array(v_e), 'q', v_fit, 'item', v_c, 'bag', true);
end $$;

-- ---------------------------------------------------------------- depósito no celeiro
create or replace function game.act_deposit(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_bag jsonb; v_only text := a ->> 'i'; v_space int; v_mv int; v_moved int := 0; v_items jsonb := '[]'::jsonb; r record;
begin
  select bag into v_bag from public.farm_members where farm_id = p_farm and user_id = p_uid;
  if v_bag is null or v_bag = '{}'::jsonb then raise exception 'bag_empty'; end if;
  v_space := game.inv_space(p_farm, p_cat);
  for r in select key, value::int as q from jsonb_each_text(v_bag) order by key loop
    continue when v_only is not null and r.key <> v_only;
    exit when v_space <= 0;
    v_mv := least(r.q, v_space);
    insert into public.farm_inventory (farm_id, item_id, quantity) values (p_farm, r.key, v_mv)
      on conflict (farm_id, item_id) do update set quantity = public.farm_inventory.quantity + excluded.quantity;
    v_bag := case when r.q = v_mv then v_bag - r.key else jsonb_set(v_bag, array[r.key], to_jsonb(r.q - v_mv)) end;
    v_space := v_space - v_mv; v_moved := v_moved + v_mv; v_items := v_items || to_jsonb(r.key);
  end loop;
  if v_moved = 0 then raise exception 'storage_full'; end if;
  update public.farm_members set bag = v_bag where farm_id = p_farm and user_id = p_uid;
  perform game.stat(p_farm, p_uid, 'deposit', v_moved, 'deposit');
  return jsonb_build_object('i', v_items, 'q', v_moved, 'left', game.bag_total(v_bag));
end $$;

-- ---------------------------------------------------------------- venda (estoque ou mochila)
create or replace function game.act_sell(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_it text := a ->> 'i'; v_q int := (a ->> 'q')::int; v_price int; v_m int; v_bonus numeric := 0; v_gain int; v_bag boolean := (a ->> 'src') = 'bag';
begin
  v_price := (p_cat -> 'items' -> v_it ->> 'price')::int;
  if v_price is null or v_q is null or v_q < 1 or v_q > 9999 then raise exception 'invalid'; end if;
  if v_bag then perform game.bag_take(p_farm, p_uid, v_it, v_q); else perform game.inv_take(p_farm, v_it, v_q); end if;
  v_m := game.lvl(p_farm, 'market');
  if v_m > 0 then v_bonus := (p_cat -> 'config' -> 'marketBonus' ->> (v_m - 1))::numeric; end if;
  v_gain := floor(v_price * v_q * (1 + v_bonus));
  update public.farms set coins = coins + v_gain where id = p_farm;
  perform game.stat(p_farm, p_uid, 'sold', v_q, 'sold');
  return jsonb_build_object('i', case when v_bag then '[]'::jsonb else jsonb_build_array(v_it) end, 'g', v_gain);
end $$;

-- ---------------------------------------------------------------- mochila maior
create or replace function game.act_bag(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_tier int; v_up jsonb;
begin
  select bag_tier into v_tier from public.farm_members where farm_id = p_farm and user_id = p_uid;
  v_up := p_cat -> 'config' -> 'bagUp' -> v_tier;
  if v_up is null then raise exception 'max_level'; end if;
  perform game.require_level(p_farm, (v_up ->> 'level')::int);
  perform game.pay(p_farm, v_up);
  update public.farm_members set bag_tier = v_tier + 1 where farm_id = p_farm and user_id = p_uid;
  return jsonb_build_object('i', coalesce((select jsonb_agg(k) from jsonb_object_keys(coalesce(v_up -> 'items', '{}'::jsonb)) k), '[]'::jsonb), 'tier', v_tier + 1);
end $$;

-- ---------------------------------------------------------------- ajudantes
-- Recolhe a produção de um ajudante para o estoque (o que couber). Devolve {lv, at, m: quantidade movida}.
create or replace function game.worker_claim(p_farm uuid, p_id text, p_w jsonb, p_rec jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_lv int := (p_rec ->> 'lv')::int; v_at bigint := (p_rec ->> 'at')::bigint; v_per bigint; v_raw int; v_prod int; v_fit int;
begin
  v_per := (p_w -> 'period' ->> (v_lv - 1))::bigint;
  v_raw := floor((p_now - v_at) / v_per);
  v_prod := least(v_raw, (p_w ->> 'cap')::int);
  v_fit := greatest(0, least(v_prod, game.inv_space(p_farm, p_cat)));
  if v_fit > 0 then
    insert into public.farm_inventory (farm_id, item_id, quantity) values (p_farm, p_w ->> 'item', v_fit)
      on conflict (farm_id, item_id) do update set quantity = public.farm_inventory.quantity + excluded.quantity;
  end if;
  if v_raw >= (p_w ->> 'cap')::int and v_fit = v_prod then v_at := p_now; else v_at := v_at + v_fit * v_per; end if;
  return jsonb_build_object('lv', v_lv, 'at', v_at, 'm', greatest(v_fit, 0));
end $$;

create or replace function game.act_hire(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'w'; v_w jsonb; v_st jsonb; v_rec jsonb; v_lv int;
begin
  v_w := p_cat -> 'workers' -> v_id;
  if v_w is null then raise exception 'invalid'; end if;
  perform game.require_level(p_farm, (v_w ->> 'level')::int);
  if not exists (select 1 from public.farms where id = p_farm and progression -> 'regions' ? (v_w ->> 'region')) then raise exception 'region_locked'; end if;
  insert into public.farm_entities (farm_id, entity_key, kind, level, state) values (p_farm, 'workers', 'workers', 0, '{"w":{}}')
    on conflict (farm_id, entity_key) do nothing;
  select state into v_st from public.farm_entities where farm_id = p_farm and entity_key = 'workers';
  v_rec := v_st -> 'w' -> v_id;
  v_lv := coalesce((v_rec ->> 'lv')::int, 0);
  if v_lv >= jsonb_array_length(v_w -> 'costs') then raise exception 'max_level'; end if;
  if v_lv > 0 then v_rec := game.worker_claim(p_farm, v_id, v_w, v_rec, p_cat, p_now); end if;
  perform game.pay(p_farm, v_w -> 'costs' -> v_lv);
  v_rec := jsonb_build_object('lv', v_lv + 1, 'at', coalesce((v_rec ->> 'at')::bigint, p_now));
  update public.farm_entities set state = jsonb_set(coalesce(state, '{}'), array['w', v_id], v_rec, true) where farm_id = p_farm and entity_key = 'workers';
  perform game.stat(p_farm, p_uid, 'hire', 1, 'hire');
  return jsonb_build_object('e', jsonb_build_array('workers'),
    'i', coalesce((select jsonb_agg(k) from jsonb_object_keys(coalesce(v_w -> 'costs' -> v_lv -> 'items', '{}'::jsonb)) k), '[]'::jsonb) || jsonb_build_array(v_w ->> 'item'));
end $$;

create or replace function game.act_wclaim(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_st jsonb; v_w jsonb := '{}'::jsonb; v_moved int := 0; v_rec jsonb; v_items jsonb := '[]'::jsonb; r record;
begin
  select state -> 'w' into v_st from public.farm_entities where farm_id = p_farm and entity_key = 'workers';
  if v_st is null or v_st = '{}'::jsonb then raise exception 'not_ready'; end if;
  for r in select key, value from jsonb_each(v_st) order by key loop
    v_rec := game.worker_claim(p_farm, r.key, p_cat -> 'workers' -> r.key, r.value, p_cat, p_now);
    v_w := jsonb_set(v_w, array[r.key], v_rec - 'm', true);
    v_moved := v_moved + (v_rec ->> 'm')::int;
    if (v_rec ->> 'm')::int > 0 then v_items := v_items || to_jsonb(p_cat -> 'workers' -> r.key ->> 'item'); end if;
  end loop;
  if v_moved = 0 then raise exception 'not_ready'; end if;
  update public.farm_entities set state = jsonb_set(state, '{w}', v_w) where farm_id = p_farm and entity_key = 'workers';
  perform game.stat(p_farm, p_uid, 'workers', v_moved);
  return jsonb_build_object('i', v_items, 'e', jsonb_build_array('workers'), 'q', v_moved);
end $$;

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
    when 'quest' then game.act_quest(p_farm, p_uid, a, p_cat, p_now)
    when 'deposit' then game.act_deposit(p_farm, p_uid, a, p_cat, p_now)
    when 'bag' then game.act_bag(p_farm, p_uid, a, p_cat, p_now)
    when 'hire' then game.act_hire(p_farm, p_uid, a, p_cat, p_now)
    when 'wclaim' then game.act_wclaim(p_farm, p_uid, a, p_cat, p_now)
  end;
end $$;

-- ---------------------------------------------------------------- estado e delta com mochila
create or replace function game.members_json(p_farm uuid) returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', p.username, 'role', m.role,
    'stats', m.stats, 'look', p.character_config, 'joined_at', m.joined_at, 'bag', m.bag, 'bag_tier', m.bag_tier) order by m.joined_at), '[]'::jsonb)
  from public.farm_members m join public.profiles p on p.user_id = m.user_id where m.farm_id = p_farm
$$;

create or replace function game.delta(p_farm uuid, p_rev bigint, p_uid uuid, p_now bigint, p_inv text[], p_ents text[], p_ords int[]) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'rev', p_rev, 'by', p_uid, 'now', p_now,
    'farm', (select jsonb_build_object('level', f.level, 'xp', f.xp, 'coins', f.coins, 'reputation', f.reputation,
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
    'member', (select jsonb_build_object('user_id', m.user_id, 'stats', m.stats, 'bag', m.bag, 'bag_tier', m.bag_tier) from public.farm_members m
               where m.farm_id = p_farm and m.user_id = p_uid)
  )
$$;

revoke all on all functions in schema game from public, anon, authenticated;
grant execute on function game.is_member(uuid), game.shares_farm(uuid), game.topic_member(text) to authenticated;
