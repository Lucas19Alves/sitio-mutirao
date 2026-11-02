-- Lógica autoritativa do jogo. O cliente só chama as funções públicas
-- (create_farm, join_farm, leave_farm, my_farms, get_farm_state, farm_act).
-- Todas as ações econômicas passam por public.farm_act, que trava a linha
-- da fazenda (FOR UPDATE) e valida cada ação contra o catálogo do servidor.
-- Erros de ação são códigos curtos ("missing_item:wood:3") traduzidos no cliente.

-- ================================================================ utilidades
create or replace function game.now_ms() returns bigint language sql volatile set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

create or replace function game.cat() returns jsonb language sql stable security definer set search_path = '' as $$
  select data from game.catalog where id = 1
$$;

create or replace function game.lvl(p_farm uuid, p_key text) returns int language sql stable set search_path = '' as $$
  select coalesce((select e.level from public.farm_entities e where e.farm_id = p_farm and e.entity_key = p_key), 0)
$$;

create or replace function game.capacity(p_farm uuid, p_cat jsonb) returns int language plpgsql stable set search_path = '' as $$
declare v_b int := game.lvl(p_farm, 'barn'); v_w int := game.lvl(p_farm, 'warehouse'); v_cap int;
begin
  v_cap := (p_cat -> 'config' -> 'barnCap' ->> (greatest(v_b, 1) - 1))::int;
  if v_w > 0 then v_cap := v_cap + (p_cat -> 'config' -> 'warehouseCap' ->> (v_w - 1))::int; end if;
  return v_cap;
end $$;

create or replace function game.inv_take(p_farm uuid, p_item text, p_q int) returns void language plpgsql set search_path = '' as $$
begin
  if p_q is null or p_q <= 0 then raise exception 'invalid_qty'; end if;
  update public.farm_inventory set quantity = quantity - p_q
    where farm_id = p_farm and item_id = p_item and quantity >= p_q;
  if not found then raise exception 'missing_item:%:%', p_item, p_q; end if;
  delete from public.farm_inventory where farm_id = p_farm and item_id = p_item and quantity = 0;
end $$;

create or replace function game.inv_add(p_farm uuid, p_item text, p_q int, p_cat jsonb) returns void language plpgsql set search_path = '' as $$
declare v_total int;
begin
  if p_q <= 0 then return; end if;
  select coalesce(sum(quantity), 0) into v_total from public.farm_inventory where farm_id = p_farm;
  if v_total + p_q > game.capacity(p_farm, p_cat) then raise exception 'storage_full'; end if;
  insert into public.farm_inventory (farm_id, item_id, quantity) values (p_farm, p_item, p_q)
    on conflict (farm_id, item_id) do update set quantity = public.farm_inventory.quantity + excluded.quantity;
end $$;

-- Paga {coins, items:{id:q}} da economia compartilhada.
create or replace function game.pay(p_farm uuid, p_cost jsonb) returns void language plpgsql set search_path = '' as $$
declare v_c int := coalesce((p_cost ->> 'coins')::int, 0); r record;
begin
  if v_c > 0 then
    update public.farms set coins = coins - v_c where id = p_farm and coins >= v_c;
    if not found then raise exception 'no_coins:%', v_c; end if;
  end if;
  for r in select key, value from jsonb_each_text(coalesce(p_cost -> 'items', '{}'::jsonb)) loop
    perform game.inv_take(p_farm, r.key, r.value::int);
  end loop;
end $$;

create or replace function game.stat(p_farm uuid, p_uid uuid, p_key text, p_n int, p_mkey text default null) returns void language plpgsql set search_path = '' as $$
begin
  update public.farms
    set progression = jsonb_set(progression, array['stats', p_key], to_jsonb(coalesce((progression -> 'stats' ->> p_key)::int, 0) + p_n), true)
    where id = p_farm;
  if p_mkey is not null then
    update public.farm_members
      set stats = jsonb_set(stats, array[p_mkey], to_jsonb(coalesce((stats ->> p_mkey)::int, 0) + p_n), true)
      where farm_id = p_farm and user_id = p_uid;
  end if;
end $$;

create or replace function game.add_xp(p_farm uuid, p_n int, p_cat jsonb) returns void language plpgsql set search_path = '' as $$
declare v_lv int; v_xp int; v_need int; v_bonus int := 0; v_max int := (p_cat ->> 'maxLevel')::int;
begin
  if p_n <= 0 then return; end if;
  select level, xp into v_lv, v_xp from public.farms where id = p_farm;
  v_xp := v_xp + p_n;
  loop
    exit when v_lv >= v_max;
    v_need := (p_cat -> 'levels' ->> (v_lv - 1))::int;
    exit when v_xp < v_need;
    v_xp := v_xp - v_need;
    v_lv := v_lv + 1;
    v_bonus := v_bonus + 25 * v_lv;
  end loop;
  update public.farms set level = v_lv, xp = v_xp, coins = coins + v_bonus where id = p_farm;
end $$;

create or replace function game.require_level(p_farm uuid, p_level int) returns void language plpgsql set search_path = '' as $$
begin
  if (select level from public.farms where id = p_farm) < p_level then raise exception 'level_required:%', p_level; end if;
end $$;

create or replace function game.plots(p_farm uuid, p_e text, p_cat jsonb) returns int language plpgsql stable set search_path = '' as $$
declare v_l int;
begin
  if p_e = 'field' then
    v_l := game.lvl(p_farm, 'farmhouse');
    return (p_cat -> 'config' -> 'plots' ->> (greatest(v_l, 1) - 1))::int;
  elsif p_e = 'greenhouse' then
    v_l := game.lvl(p_farm, 'greenhouse');
    if v_l < 1 then return 0; end if;
    return (p_cat -> 'config' -> 'greenhousePlots' ->> (v_l - 1))::int;
  end if;
  return 0;
end $$;

-- ================================================================ geração de pedidos e contratos
create or replace function game.gen_order(p_farm uuid, p_slot int, p_cat jsonb) returns void language plpgsql set search_path = '' as $$
declare
  v_lv int; v_regs jsonb; v_cand text[]; v_pick text[]; v_n int; v_items jsonb := '{}'::jsonb;
  v_total numeric := 0; v_target numeric; v_it text; v_price int; v_q int; v_npc text;
begin
  select level, progression -> 'regions' into v_lv, v_regs from public.farms where id = p_farm;
  select array_agg(e.key) into v_cand
    from jsonb_each(p_cat -> 'items') e
    where (e.value ->> 'level')::int <= v_lv
      and v_regs ? (e.value -> 'src' ->> 'r')
      and (e.value -> 'src' ->> 'b' is null
           or exists (select 1 from public.farm_entities fe where fe.farm_id = p_farm and fe.entity_key = e.value -> 'src' ->> 'b' and fe.level >= 1));
  v_n := least(coalesce(array_length(v_cand, 1), 0), 1 + floor(random() * least(3, 1 + v_lv / 5.0))::int);
  if v_n = 0 then return; end if;
  select array_agg(x) into v_pick from (select x from unnest(v_cand) x order by random() limit v_n) s;
  v_target := (25 + v_lv * 14) * (0.75 + random() * 0.6);
  foreach v_it in array v_pick loop
    v_price := (p_cat -> 'items' -> v_it ->> 'price')::int;
    v_q := least(40, greatest(1, round(v_target / v_n / v_price)::int));
    v_items := v_items || jsonb_build_object(v_it, v_q);
    v_total := v_total + v_price * v_q;
  end loop;
  v_npc := p_cat -> 'npcs' ->> floor(random() * jsonb_array_length(p_cat -> 'npcs'))::int;
  insert into public.farm_orders (farm_id, slot, order_key, npc, items, reward, progress, status)
    values (p_farm, p_slot, 'order', v_npc, v_items,
            jsonb_build_object('coins', round(v_total * 1.35)::int, 'xp', round(v_total * 0.3)::int + 4, 'rep', 1), '{}'::jsonb, 'open')
    on conflict (farm_id, slot) do update
      set order_key = excluded.order_key, npc = excluded.npc, items = excluded.items, reward = excluded.reward,
          progress = excluded.progress, status = excluded.status;
end $$;

create or replace function game.gen_contract(p_farm uuid, p_idx int, p_cat jsonb) returns void language plpgsql set search_path = '' as $$
declare v_ct jsonb := p_cat -> 'contracts' -> (p_idx % jsonb_array_length(p_cat -> 'contracts'));
begin
  insert into public.farm_orders (farm_id, slot, order_key, npc, items, reward, progress, status)
    values (p_farm, 99, v_ct ->> 'id', v_ct ->> 'npc', v_ct -> 'items',
            jsonb_build_object('coins', v_ct -> 'coins', 'xp', v_ct -> 'xp', 'rep', v_ct -> 'rep', 'level', v_ct -> 'level'),
            jsonb_build_object('got', '{}'::jsonb, 'by', '{}'::jsonb), 'open')
    on conflict (farm_id, slot) do update
      set order_key = excluded.order_key, npc = excluded.npc, items = excluded.items, reward = excluded.reward,
          progress = excluded.progress, status = excluded.status;
end $$;

-- ================================================================ ações
create or replace function game.act_harvest(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'n'; v_w jsonb; v_nd jsonb; v_prog jsonb; v_nodes jsonb; v_tier int; v_req int; v_q int; v_item text;
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
  perform game.inv_add(p_farm, v_item, v_q, p_cat);
  update public.farms set nodes = jsonb_set(nodes, array[v_id], to_jsonb(p_now + (v_nd ->> 'respawn')::bigint * 1000)) where id = p_farm;
  perform game.add_xp(p_farm, (v_nd ->> 'xp')::int, p_cat);
  perform game.stat(p_farm, p_uid, 'h:' || v_item, v_q, 'harvest');
  return jsonb_build_object('i', jsonb_build_array(v_item), 'q', v_q, 'item', v_item);
end $$;

create or replace function game.act_plant(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_e text := a ->> 'e'; v_i int := (a ->> 'i')::int; v_c text := a ->> 'c'; v_cr jsonb; v_p jsonb;
begin
  v_cr := p_cat -> 'crops' -> v_c;
  if v_cr is null or v_i is null or v_e not in ('field', 'greenhouse') then raise exception 'invalid'; end if;
  perform game.require_level(p_farm, (v_cr ->> 'level')::int);
  if v_cr ->> 'region' is not null and not exists (select 1 from public.farms where id = p_farm and progression -> 'regions' ? (v_cr ->> 'region')) then
    raise exception 'region_locked';
  end if;
  if v_i < 0 or v_i >= game.plots(p_farm, v_e, p_cat) then raise exception 'invalid'; end if;
  select coalesce(state -> 'p', '[]'::jsonb) into v_p from public.farm_entities where farm_id = p_farm and entity_key = v_e;
  if v_p is null then raise exception 'invalid'; end if;
  if jsonb_array_length(v_p) > v_i and jsonb_typeof(v_p -> v_i) <> 'null' then raise exception 'plot_busy'; end if;
  while jsonb_array_length(v_p) <= v_i loop v_p := v_p || 'null'::jsonb; end loop;
  v_p := jsonb_set(v_p, array[v_i::text], jsonb_build_array(v_c, p_now));
  perform game.pay(p_farm, jsonb_build_object('coins', v_cr -> 'seed'));
  update public.farm_entities set state = jsonb_set(state, '{p}', v_p) where farm_id = p_farm and entity_key = v_e;
  perform game.stat(p_farm, p_uid, 'plant', 1, 'plant');
  return jsonb_build_object('e', jsonb_build_array(v_e));
end $$;

create or replace function game.act_reap(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_e text := a ->> 'e'; v_i int := (a ->> 'i')::int; v_p jsonb; v_slot jsonb; v_c text; v_cr jsonb;
  v_mult numeric := 1; v_well int; v_q int; v_tier int; v_prog jsonb;
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
  perform game.inv_add(p_farm, v_c, v_q, p_cat);
  update public.farm_entities set state = jsonb_set(state, array['p', v_i::text], 'null'::jsonb) where farm_id = p_farm and entity_key = v_e;
  perform game.add_xp(p_farm, (v_cr ->> 'xp')::int, p_cat);
  perform game.stat(p_farm, p_uid, 'h:' || v_c, v_q, 'harvest');
  return jsonb_build_object('i', jsonb_build_array(v_c), 'e', jsonb_build_array(v_e), 'q', v_q, 'item', v_c);
end $$;

create or replace function game.act_craft(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_b text := a ->> 'b'; v_r text := a ->> 'r'; v_rc jsonb; v_lvl int; v_q jsonb; v_start bigint; v_dur bigint;
begin
  v_rc := p_cat -> 'recipes' -> v_r;
  if v_rc is null or v_rc ->> 'b' <> v_b then raise exception 'invalid'; end if;
  v_lvl := game.lvl(p_farm, v_b);
  if v_lvl < 1 then raise exception 'not_built'; end if;
  perform game.require_level(p_farm, (v_rc ->> 'level')::int);
  select coalesce(state -> 'q', '[]'::jsonb) into v_q from public.farm_entities where farm_id = p_farm and entity_key = v_b;
  if jsonb_array_length(v_q) >= (p_cat -> 'config' ->> 'queueBase')::int + v_lvl - 1 then raise exception 'queue_full'; end if;
  perform game.pay(p_farm, jsonb_build_object('items', v_rc -> 'in'));
  v_dur := ((v_rc ->> 'time')::numeric * 1000 * (1 - 0.1 * (v_lvl - 1)))::bigint;
  v_start := p_now;
  if jsonb_array_length(v_q) > 0 then v_start := greatest(p_now, (v_q -> -1 ->> 1)::bigint); end if;
  v_q := v_q || jsonb_build_array(jsonb_build_array(v_r, v_start + v_dur));
  update public.farm_entities set state = jsonb_set(state, '{q}', v_q) where farm_id = p_farm and entity_key = v_b;
  return jsonb_build_object('i', (select jsonb_agg(k) from jsonb_object_keys(v_rc -> 'in') k), 'e', jsonb_build_array(v_b));
end $$;

create or replace function game.act_collect(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_b text := a ->> 'b'; v_q jsonb; v_new jsonb := '[]'::jsonb; v_el jsonb; v_rc jsonb; v_r text;
  v_done int := 0; v_full boolean := false; v_xp int := 0; v_items jsonb := '[]'::jsonb;
begin
  select state -> 'q' into v_q from public.farm_entities where farm_id = p_farm and entity_key = v_b;
  if v_q is null then raise exception 'not_ready'; end if;
  for v_el in select value from jsonb_array_elements(v_q) loop
    if not v_full and (v_el ->> 1)::bigint <= p_now + 1000 then
      v_r := v_el ->> 0;
      v_rc := p_cat -> 'recipes' -> v_r;
      begin
        perform game.inv_add(p_farm, v_r, (v_rc ->> 'out')::int, p_cat);
      exception when others then
        if sqlerrm = 'storage_full' then v_full := true; v_new := v_new || jsonb_build_array(v_el); continue; end if;
        raise;
      end;
      v_done := v_done + 1;
      v_xp := v_xp + (v_rc ->> 'xp')::int;
      v_items := v_items || to_jsonb(v_r);
      perform game.stat(p_farm, p_uid, 'c:' || v_r, (v_rc ->> 'out')::int, 'craft');
    else
      v_new := v_new || jsonb_build_array(v_el);
    end if;
  end loop;
  if v_done = 0 then
    if v_full then raise exception 'storage_full'; end if;
    raise exception 'not_ready';
  end if;
  update public.farm_entities set state = jsonb_set(state, '{q}', v_new) where farm_id = p_farm and entity_key = v_b;
  perform game.add_xp(p_farm, v_xp, p_cat);
  return jsonb_build_object('i', v_items, 'e', jsonb_build_array(v_b), 'n', v_done);
end $$;

create or replace function game.act_sell(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_it text := a ->> 'i'; v_q int := (a ->> 'q')::int; v_price int; v_m int; v_bonus numeric := 0; v_gain int;
begin
  v_price := (p_cat -> 'items' -> v_it ->> 'price')::int;
  if v_price is null or v_q is null or v_q < 1 or v_q > 9999 then raise exception 'invalid'; end if;
  perform game.inv_take(p_farm, v_it, v_q);
  v_m := game.lvl(p_farm, 'market');
  if v_m > 0 then v_bonus := (p_cat -> 'config' -> 'marketBonus' ->> (v_m - 1))::numeric; end if;
  v_gain := floor(v_price * v_q * (1 + v_bonus));
  update public.farms set coins = coins + v_gain where id = p_farm;
  perform game.stat(p_farm, p_uid, 'sold', v_q, 'sold');
  return jsonb_build_object('i', jsonb_build_array(v_it), 'g', v_gain);
end $$;

create or replace function game.act_tool(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_t text := a ->> 'tool'; v_tiers jsonb; v_cur int; v_nx jsonb;
begin
  v_tiers := p_cat -> 'tools' -> v_t;
  if v_tiers is null then raise exception 'invalid'; end if;
  select coalesce((progression -> 'tools' ->> v_t)::int, 0) into v_cur from public.farms where id = p_farm;
  if v_cur >= jsonb_array_length(v_tiers) then raise exception 'max_tier'; end if;
  v_nx := v_tiers -> v_cur;
  perform game.require_level(p_farm, (v_nx ->> 'level')::int);
  if coalesce(v_nx ->> 'needs', '') <> '' and game.lvl(p_farm, v_nx ->> 'needs') < 1 then
    raise exception 'building_required:%', v_nx ->> 'needs';
  end if;
  perform game.pay(p_farm, jsonb_build_object('coins', v_nx -> 'coins', 'items', v_nx -> 'items'));
  update public.farms set progression = jsonb_set(progression, array['tools', v_t], to_jsonb(v_cur + 1), true) where id = p_farm;
  perform game.add_xp(p_farm, 10 * (v_cur + 1), p_cat);
  return jsonb_build_object('i', coalesce((select jsonb_agg(k) from jsonb_object_keys(v_nx -> 'items') k), '[]'::jsonb));
end $$;

-- Projeto coletivo: construir (b:id), melhorar (u:id) ou expandir região (r:id).
-- Qualquer membro entrega parte dos materiais/moedas; o projeto é criado na 1ª entrega.
create or replace function game.act_give(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_k text := a ->> 'k'; v_res text := a ->> 'i'; v_q int := (a ->> 'q')::int;
  v_kind text := split_part(v_k, ':', 1); v_id text := split_part(v_k, ':', 2);
  v_key text; v_ent record; v_proj jsonb; v_def jsonb; v_up jsonb; v_need jsonb; v_regs jsonb;
  v_needv int; v_gotv int; v_val int; v_done boolean; r record; v_total numeric; v_share_ok int; v_coop boolean;
  v_xp int; v_old int; v_new int; s int; v_ents jsonb;
begin
  if v_q is null or v_q < 1 or v_res is null then raise exception 'invalid'; end if;
  v_key := case v_kind when 'r' then 'region:' || v_id else v_id end;
  select level, state into v_ent from public.farm_entities where farm_id = p_farm and entity_key = v_key;
  v_proj := case when v_ent is null then null else v_ent.state -> 'proj' end;
  select progression -> 'regions' into v_regs from public.farms where id = p_farm;

  if v_proj is null then
    if v_kind = 'b' then
      v_def := p_cat -> 'buildings' -> v_id;
      if v_def is null or v_def ->> 'kind' = 'starter' then raise exception 'invalid'; end if;
      if coalesce(v_ent.level, 0) >= 1 then raise exception 'already_built'; end if;
      perform game.require_level(p_farm, (v_def ->> 'level')::int);
      if not v_regs ? (v_def ->> 'region') then raise exception 'region_locked'; end if;
      v_need := v_def -> 'cost';
    elsif v_kind = 'u' then
      v_def := p_cat -> 'buildings' -> v_id;
      if v_def is null then raise exception 'invalid'; end if;
      if coalesce(v_ent.level, 0) < 1 then raise exception 'not_built'; end if;
      if v_ent.level - 1 >= jsonb_array_length(v_def -> 'upgrades') then raise exception 'max_level'; end if;
      v_up := v_def -> 'upgrades' -> (v_ent.level - 1);
      perform game.require_level(p_farm, (v_up ->> 'level')::int);
      v_need := jsonb_build_object('coins', v_up -> 'coins', 'items', v_up -> 'items');
    elsif v_kind = 'r' then
      v_def := p_cat -> 'regions' -> v_id;
      if v_def is null then raise exception 'invalid'; end if;
      if v_regs ? v_id then raise exception 'already_unlocked'; end if;
      perform game.require_level(p_farm, (v_def ->> 'level')::int);
      if v_def ->> 'needs' is not null and game.lvl(p_farm, v_def ->> 'needs') < 1 then
        raise exception 'building_required:%', v_def ->> 'needs';
      end if;
      v_need := jsonb_build_object('coins', v_def -> 'coins', 'items', v_def -> 'items');
    else
      raise exception 'invalid';
    end if;
    if (select count(*) from public.farm_entities where farm_id = p_farm and state ? 'proj') >= 4 then
      raise exception 'too_many_projects';
    end if;
    v_proj := jsonb_build_object('k', v_k, 'need', v_need, 'got', '{}'::jsonb, 'by', '{}'::jsonb, 'at', p_now);
    insert into public.farm_entities (farm_id, entity_key, kind, level, state)
      values (p_farm, v_key, case v_kind when 'r' then 'region' else 'building' end, 0, jsonb_build_object('proj', v_proj))
      on conflict (farm_id, entity_key) do update set state = public.farm_entities.state || jsonb_build_object('proj', v_proj);
    select level, state into v_ent from public.farm_entities where farm_id = p_farm and entity_key = v_key;
  elsif v_proj ->> 'k' <> v_k then
    raise exception 'invalid';
  end if;

  -- entrega
  if v_res = 'coins' then v_needv := (v_proj -> 'need' ->> 'coins')::int;
  else v_needv := (v_proj -> 'need' -> 'items' ->> v_res)::int; end if;
  v_gotv := coalesce((v_proj -> 'got' ->> v_res)::int, 0);
  if v_needv is null or v_needv - v_gotv <= 0 then raise exception 'not_needed'; end if;
  v_q := least(v_q, v_needv - v_gotv);
  if v_res = 'coins' then
    perform game.pay(p_farm, jsonb_build_object('coins', v_q));
    v_val := v_q;
  else
    perform game.inv_take(p_farm, v_res, v_q);
    v_val := v_q * (p_cat -> 'items' -> v_res ->> 'price')::int;
  end if;
  v_proj := jsonb_set(v_proj, array['got', v_res], to_jsonb(v_gotv + v_q));
  v_proj := jsonb_set(v_proj, array['by', p_uid::text], to_jsonb(coalesce((v_proj -> 'by' ->> p_uid::text)::int, 0) + v_val));
  perform game.stat(p_farm, p_uid, 'give', v_val, 'give');

  v_done := coalesce((v_proj -> 'need' ->> 'coins')::int, 0) <= coalesce((v_proj -> 'got' ->> 'coins')::int, 0);
  for r in select key, value from jsonb_each_text(coalesce(v_proj -> 'need' -> 'items', '{}'::jsonb)) loop
    if coalesce((v_proj -> 'got' ->> r.key)::int, 0) < r.value::int then v_done := false; end if;
  end loop;

  v_ents := jsonb_build_array(v_key);
  if not v_done then
    update public.farm_entities set state = jsonb_set(state, '{proj}', v_proj) where farm_id = p_farm and entity_key = v_key;
    return jsonb_build_object('i', case when v_res = 'coins' then '[]'::jsonb else jsonb_build_array(v_res) end, 'e', v_ents, 'done', false);
  end if;

  -- concluído: bônus de cooperação se 2+ membros com >= coopMinShare do valor
  select coalesce(sum(value::numeric), 0) into v_total from jsonb_each_text(v_proj -> 'by');
  select count(*) into v_share_ok from jsonb_each_text(v_proj -> 'by')
    where value::numeric >= v_total * (p_cat -> 'config' ->> 'coopMinShare')::numeric;
  v_coop := v_share_ok >= 2;
  v_xp := round(v_total * 0.12)::int + 10;
  if v_coop then
    v_xp := round(v_xp * (1 + (p_cat -> 'config' ->> 'coopProjectXp')::numeric))::int;
    update public.farms set reputation = reputation + 2,
      coins = coins + floor(coalesce((v_proj -> 'need' ->> 'coins')::int, 0) * 0.1)::int where id = p_farm;
    perform game.stat(p_farm, p_uid, 'coop', 1);
  end if;

  if v_kind = 'r' then
    update public.farms set progression = jsonb_set(progression, '{regions}', (progression -> 'regions') || to_jsonb(v_id)) where id = p_farm;
    delete from public.farm_entities where farm_id = p_farm and entity_key = v_key;
  else
    v_old := v_ent.level;
    update public.farm_entities set level = level + 1, state = state - 'proj' where farm_id = p_farm and entity_key = v_key;
    v_new := v_old + 1;
    if v_id = 'greenhouse' and v_old = 0 then
      update public.farm_entities set state = state || '{"p": []}'::jsonb where farm_id = p_farm and entity_key = v_key;
    end if;
    if v_id = 'order_board' then
      for s in (p_cat -> 'config' -> 'boardSlots' ->> (v_old - 1))::int .. (p_cat -> 'config' -> 'boardSlots' ->> (v_new - 1))::int - 1 loop
        perform game.gen_order(p_farm, s, p_cat);
      end loop;
    end if;
  end if;
  perform game.add_xp(p_farm, v_xp, p_cat);
  perform game.stat(p_farm, p_uid, 'projects', 1);
  return jsonb_build_object('i', case when v_res = 'coins' then '[]'::jsonb else jsonb_build_array(v_res) end,
    'e', v_ents, 'o', case when v_id = 'order_board' then '[0,1,2,3,4]'::jsonb else '[]'::jsonb end,
    'done', true, 'coop', v_coop, 'xp', v_xp);
end $$;

create or replace function game.act_order(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_slot int := (a ->> 'o')::int; v_o record; r record;
begin
  select * into v_o from public.farm_orders where farm_id = p_farm and slot = v_slot and slot < 99;
  if not found then raise exception 'invalid'; end if;
  for r in select key, value from jsonb_each_text(v_o.items) loop
    perform game.inv_take(p_farm, r.key, r.value::int);
  end loop;
  update public.farms set coins = coins + (v_o.reward ->> 'coins')::int, reputation = reputation + (v_o.reward ->> 'rep')::int where id = p_farm;
  perform game.add_xp(p_farm, (v_o.reward ->> 'xp')::int, p_cat);
  perform game.stat(p_farm, p_uid, 'orders', 1, 'orders');
  perform game.gen_order(p_farm, v_slot, p_cat);
  return jsonb_build_object('i', (select jsonb_agg(k) from jsonb_object_keys(v_o.items) k), 'o', jsonb_build_array(v_slot));
end $$;

create or replace function game.act_skip(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_slot int := (a ->> 'o')::int;
begin
  if not exists (select 1 from public.farm_orders where farm_id = p_farm and slot = v_slot and slot < 99) then raise exception 'invalid'; end if;
  perform game.gen_order(p_farm, v_slot, p_cat);
  return jsonb_build_object('o', jsonb_build_array(v_slot));
end $$;

-- Contrato coletivo: entregas parciais de qualquer membro.
create or replace function game.act_cgive(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_it text := a ->> 'i'; v_q int := (a ->> 'q')::int; v_o record; v_needv int; v_gotv int; v_val int; v_prog jsonb;
  v_done boolean := true; r record; v_total numeric; v_share_ok int; v_mul numeric := 1; v_coop boolean; v_idx int;
begin
  if v_q is null or v_q < 1 then raise exception 'invalid'; end if;
  select * into v_o from public.farm_orders where farm_id = p_farm and slot = 99;
  if not found then raise exception 'invalid'; end if;
  perform game.require_level(p_farm, (v_o.reward ->> 'level')::int);
  v_needv := (v_o.items ->> v_it)::int;
  v_gotv := coalesce((v_o.progress -> 'got' ->> v_it)::int, 0);
  if v_needv is null or v_needv - v_gotv <= 0 then raise exception 'not_needed'; end if;
  v_q := least(v_q, v_needv - v_gotv);
  perform game.inv_take(p_farm, v_it, v_q);
  v_val := v_q * (p_cat -> 'items' -> v_it ->> 'price')::int;
  v_prog := jsonb_set(v_o.progress, array['got', v_it], to_jsonb(v_gotv + v_q));
  v_prog := jsonb_set(v_prog, array['by', p_uid::text], to_jsonb(coalesce((v_prog -> 'by' ->> p_uid::text)::int, 0) + v_val));
  perform game.stat(p_farm, p_uid, 'cgive', v_q, 'cgive');
  for r in select key, value from jsonb_each_text(v_o.items) loop
    if coalesce((v_prog -> 'got' ->> r.key)::int, 0) < r.value::int then v_done := false; end if;
  end loop;
  if not v_done then
    update public.farm_orders set progress = v_prog where farm_id = p_farm and slot = 99;
    return jsonb_build_object('i', jsonb_build_array(v_it), 'o', '[99]'::jsonb, 'done', false);
  end if;
  select coalesce(sum(value::numeric), 0) into v_total from jsonb_each_text(v_prog -> 'by');
  select count(*) into v_share_ok from jsonb_each_text(v_prog -> 'by')
    where value::numeric >= v_total * (p_cat -> 'config' ->> 'coopMinShare')::numeric;
  v_coop := v_share_ok >= 2;
  if v_coop then v_mul := 1 + (p_cat -> 'config' ->> 'coopContractBonus')::numeric; end if;
  update public.farms set coins = coins + round((v_o.reward ->> 'coins')::int * v_mul)::int,
    reputation = reputation + (v_o.reward ->> 'rep')::int + case when v_coop then 2 else 0 end where id = p_farm;
  perform game.add_xp(p_farm, round((v_o.reward ->> 'xp')::int * v_mul)::int, p_cat);
  perform game.stat(p_farm, p_uid, 'contracts', 1);
  if v_coop then perform game.stat(p_farm, p_uid, 'coop', 1); end if;
  select coalesce((progression ->> 'contract')::int, 0) + 1 into v_idx from public.farms where id = p_farm;
  update public.farms set progression = jsonb_set(progression, '{contract}', to_jsonb(v_idx)) where id = p_farm;
  perform game.gen_contract(p_farm, v_idx, p_cat);
  return jsonb_build_object('i', jsonb_build_array(v_it), 'o', '[99]'::jsonb, 'done', true, 'coop', v_coop);
end $$;

create or replace function game.act_quest(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_f record; v_idx int; v_q jsonb; v_g jsonb; v_ok boolean;
begin
  select level, progression into v_f from public.farms where id = p_farm;
  v_idx := coalesce((v_f.progression ->> 'quest')::int, 0);
  if v_idx >= jsonb_array_length(p_cat -> 'quests') then raise exception 'no_quest'; end if;
  v_q := p_cat -> 'quests' -> v_idx;
  v_g := v_q -> 'goal';
  v_ok := case v_g ->> 'k'
    when 'stat' then coalesce((v_f.progression -> 'stats' ->> (v_g ->> 'key'))::int, 0) >= (v_g ->> 'n')::int
    when 'built' then game.lvl(p_farm, v_g ->> 'b') >= (v_g ->> 'lv')::int
    when 'tool' then coalesce((v_f.progression -> 'tools' ->> (v_g ->> 'tool'))::int, 0) >= (v_g ->> 'tier')::int
    when 'region' then (v_f.progression -> 'regions') ? (v_g ->> 'r')
    when 'level' then v_f.level >= (v_g ->> 'n')::int
    else false end;
  if not v_ok then raise exception 'quest_incomplete'; end if;
  update public.farms set coins = coins + (v_q ->> 'coins')::int,
    progression = jsonb_set(progression, '{quest}', to_jsonb(v_idx + 1)) where id = p_farm;
  perform game.add_xp(p_farm, (v_q ->> 'xp')::int, p_cat);
  return '{}'::jsonb;
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
  end;
end $$;

-- ================================================================ snapshots
create or replace function game.members_json(p_farm uuid) returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', p.username, 'role', m.role,
    'stats', m.stats, 'look', p.character_config, 'joined_at', m.joined_at) order by m.joined_at), '[]'::jsonb)
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
    'member', (select jsonb_build_object('user_id', m.user_id, 'stats', m.stats) from public.farm_members m
               where m.farm_id = p_farm and m.user_id = p_uid)
  )
$$;

-- ================================================================ API pública
create or replace function public.create_farm(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_cat jsonb := game.cat(); v_id uuid; v_code text;
  v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where user_id = v_uid) then raise exception 'no_profile'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 2 or char_length(p_name) > 32 then raise exception 'invalid_name'; end if;
  if (select count(*) from public.farm_members where user_id = v_uid) >= 5 then raise exception 'too_many_farms'; end if;
  loop
    v_code := (select string_agg(substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.farms where invite_code = v_code);
  end loop;
  insert into public.farms (name, owner_id, invite_code, coins, progression)
    values (p_name, v_uid, v_code, (v_cat -> 'config' ->> 'startCoins')::int,
            jsonb_build_object('regions', jsonb_build_array('sitio'), 'tools', jsonb_build_object('axe', 1),
                               'quest', 0, 'contract', 0, 'stats', '{}'::jsonb))
    returning id into v_id;
  insert into public.farm_members (farm_id, user_id, role) values (v_id, v_uid, 'owner');
  insert into public.farm_entities (farm_id, entity_key, kind, level, state) values
    (v_id, 'farmhouse', 'building', 1, '{}'), (v_id, 'barn', 'building', 1, '{}'),
    (v_id, 'sales_cart', 'building', 1, '{}'), (v_id, 'order_board', 'building', 1, '{}'),
    (v_id, 'field', 'field', 1, '{"p": []}');
  for r in select key, value from jsonb_each_text(v_cat -> 'config' -> 'startItems') loop
    insert into public.farm_inventory (farm_id, item_id, quantity) values (v_id, r.key, r.value::int);
  end loop;
  for i in 0 .. (v_cat -> 'config' -> 'boardSlots' ->> 0)::int - 1 loop
    perform game.gen_order(v_id, i, v_cat);
  end loop;
  perform game.gen_contract(v_id, 0, v_cat);
  return v_id;
end $$;

create or replace function public.join_farm(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid; v_max int := (game.cat() -> 'config' ->> 'maxMembers')::int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles where user_id = v_uid) then raise exception 'no_profile'; end if;
  select id into v_id from public.farms where invite_code = upper(btrim(coalesce(p_code, ''))) for update;
  if v_id is null then raise exception 'invalid_code'; end if;
  if exists (select 1 from public.farm_members where farm_id = v_id and user_id = v_uid) then return v_id; end if;
  if (select count(*) from public.farm_members where farm_id = v_id) >= v_max then raise exception 'farm_full'; end if;
  if (select count(*) from public.farm_members where user_id = v_uid) >= 5 then raise exception 'too_many_farms'; end if;
  insert into public.farm_members (farm_id, user_id, role) values (v_id, v_uid, 'member');
  perform realtime.send(jsonb_build_object('members', game.members_json(v_id)), 'members', 'farm:' || v_id::text, true);
  return v_id;
end $$;

create or replace function public.leave_farm(p_farm uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_next uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.farms where id = p_farm for update;
  delete from public.farm_members where farm_id = p_farm and user_id = v_uid;
  if not found then raise exception 'not_member'; end if;
  select user_id into v_next from public.farm_members where farm_id = p_farm order by joined_at limit 1;
  if v_next is null then
    delete from public.farms where id = p_farm;
  elsif (select owner_id from public.farms where id = p_farm) = v_uid then
    update public.farms set owner_id = v_next where id = p_farm;
    update public.farm_members set role = 'owner' where farm_id = p_farm and user_id = v_next;
  end if;
  if v_next is not null then
    perform realtime.send(jsonb_build_object('members', game.members_json(p_farm)), 'members', 'farm:' || p_farm::text, true);
  end if;
end $$;

create or replace function public.my_farms() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'level', f.level, 'invite_code', f.invite_code,
    'role', m.role, 'members', (select count(*) from public.farm_members x where x.farm_id = f.id)) order by f.updated_at desc), '[]'::jsonb)
  from public.farm_members m join public.farms f on f.id = m.farm_id
  where m.user_id = (select auth.uid())
$$;

create or replace function public.get_farm_state(p_farm uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not game.is_member(p_farm) then raise exception 'not_member'; end if;
  return (select jsonb_build_object(
    'now', game.now_ms(),
    'farm', jsonb_build_object('id', f.id, 'name', f.name, 'owner_id', f.owner_id, 'invite_code', f.invite_code, 'level', f.level,
                               'xp', f.xp, 'coins', f.coins, 'reputation', f.reputation, 'rev', f.rev,
                               'progression', f.progression, 'nodes', f.nodes),
    'inv', (select coalesce(jsonb_object_agg(i.item_id, i.quantity), '{}'::jsonb) from public.farm_inventory i where i.farm_id = f.id),
    'ents', (select coalesce(jsonb_agg(jsonb_build_object('k', e.entity_key, 'kind', e.kind, 'level', e.level, 'state', e.state)), '[]'::jsonb)
             from public.farm_entities e where e.farm_id = f.id),
    'orders', (select coalesce(jsonb_agg(to_jsonb(o) - 'farm_id' order by o.slot), '[]'::jsonb) from public.farm_orders o where o.farm_id = f.id),
    'members', game.members_json(f.id)
  ) from public.farms f where f.id = p_farm);
end $$;

create or replace function public.farm_act(p_farm uuid, p_batch uuid, p_actions jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_cat jsonb; v_now bigint; a jsonb; v_res jsonb := '[]'::jsonb; v_chg jsonb;
  v_inv text[] := '{}'; v_ents text[] := '{}'; v_ords int[] := '{}'; v_last uuid; v_rev bigint; v_delta jsonb;
  v_msg text; v_okn int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_batch is null or jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions) = 0
     or jsonb_array_length(p_actions) > 40 then raise exception 'invalid_batch'; end if;
  if not game.is_member(p_farm) then raise exception 'not_member'; end if;

  -- serializa todas as ações da fazenda: impede gasto duplo entre jogadores
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

  update public.farms
    set nodes = coalesce((select jsonb_object_agg(key, value) from jsonb_each(nodes) where (value #>> '{}')::bigint > v_now), '{}'::jsonb),
        rev = rev + 1, updated_at = now()
    where id = p_farm returning rev into v_rev;
  v_delta := game.delta(p_farm, v_rev, v_uid, v_now, v_inv, v_ents, v_ords);
  -- empurra o novo estado para todos os membros conectados (canal privado)
  perform realtime.send(v_delta, 'sync', 'farm:' || p_farm::text, true);
  return v_delta || jsonb_build_object('res', v_res);
end $$;

-- ================================================================ permissões
revoke all on all functions in schema game from public, anon, authenticated;
grant execute on function game.is_member(uuid), game.shares_farm(uuid), game.topic_member(text) to authenticated;

revoke all on function public.create_farm(text), public.join_farm(text), public.leave_farm(uuid),
  public.my_farms(), public.get_farm_state(uuid), public.farm_act(uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_farm(text), public.join_farm(text), public.leave_farm(uuid),
  public.my_farms(), public.get_farm_state(uuid), public.farm_act(uuid, uuid, jsonb) to authenticated;
