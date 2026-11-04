-- v1.1: progressão integrada. Cristais, campos especializados, obstáculos físicos, missões
-- (principal em grafo + secundárias/diárias/cooperativas geradas pelo estado real), clientes
-- que só pedem o que a fazenda já consegue produzir, pets, melhorias do personagem, cosméticos
-- e aceleração de timers. Tudo validado dentro do farm_act (lock por fazenda).

alter table public.farms add column if not exists crystals int not null default 5 check (crystals >= 0);
alter table public.farm_members
  add column if not exists pets jsonb not null default '{"own": {}, "eq": null}'::jsonb,
  add column if not exists perks jsonb not null default '{}'::jsonb;
-- cosméticos comprados (globais do jogador); só o servidor escreve (o cliente só edita character_config)
alter table public.profiles add column if not exists owned jsonb not null default '[]'::jsonb;

-- campo genérico antigo → Campo de Trigo (os canteiros recomeçam vazios)
insert into public.farm_entities (farm_id, entity_key, kind, level, state)
  select f.id, 'f:wheat', 'field', 1, '{"p": []}'::jsonb from public.farms f
  on conflict (farm_id, entity_key) do nothing;
delete from public.farm_entities where entity_key = 'field';
update public.farms set progression = progression || jsonb_build_object('obs', coalesce(progression -> 'obs', '[]'::jsonb), 'mdone', coalesce(progression -> 'mdone', '[]'::jsonb));

-- ================================================================ utilitários
create or replace function game.pay_cr(p_farm uuid, p_n int) returns void language plpgsql set search_path = '' as $$
begin
  if coalesce(p_n, 0) <= 0 then return; end if;
  update public.farms set crystals = crystals - p_n where id = p_farm and crystals >= p_n;
  if not found then raise exception 'no_crystals:%', p_n; end if;
end $$;

create or replace function game.add_xp(p_farm uuid, p_n int, p_cat jsonb) returns void language plpgsql set search_path = '' as $$
declare v_lv int; v_xp int; v_need int; v_bonus int := 0; v_ups int := 0; v_max int := (p_cat ->> 'maxLevel')::int;
begin
  if p_n <= 0 then return; end if;
  select level, xp into v_lv, v_xp from public.farms where id = p_farm;
  v_xp := v_xp + p_n;
  loop
    exit when v_lv >= v_max;
    v_need := (p_cat -> 'levels' ->> (v_lv - 1))::int;
    exit when v_xp < v_need;
    v_xp := v_xp - v_need;
    v_lv := v_lv + 1; v_ups := v_ups + 1;
    v_bonus := v_bonus + 25 * v_lv;
  end loop;
  update public.farms set level = v_lv, xp = v_xp, coins = coins + v_bonus,
    crystals = crystals + v_ups * coalesce((p_cat -> 'config' ->> 'levelCrystals')::int, 0) where id = p_farm;
end $$;

/** O item já pode ser obtido pela fazenda? (regiões, campos, prédios e ferramentas do requisito) */
create or replace function game.item_ok(p_farm uuid, p_item text, p_cat jsonb, p_lv int, p_prog jsonb) returns boolean language plpgsql stable set search_path = '' as $$
declare v_req jsonb := p_cat -> 'items' -> p_item -> 'req'; r record;
begin
  if v_req is null or (p_cat -> 'items' -> p_item ->> 'level')::int > p_lv then return false; end if;
  for r in select value #>> '{}' as v from jsonb_array_elements(v_req -> 'r') loop
    if not (p_prog -> 'regions') ? r.v then return false; end if;
  end loop;
  for r in select value #>> '{}' as v from jsonb_array_elements(v_req -> 'f') loop
    if game.lvl(p_farm, 'f:' || r.v) < 1 then return false; end if;
  end loop;
  for r in select value #>> '{}' as v from jsonb_array_elements(v_req -> 'b') loop
    if game.lvl(p_farm, r.v) < 1 then return false; end if;
  end loop;
  for r in select key, value::int as n from jsonb_each_text(v_req -> 't') loop
    if coalesce((p_prog -> 'tools' ->> r.key)::int, 0) < r.n then return false; end if;
  end loop;
  return true;
end $$;

/** Objetivo de missão cumprido pelo estado real da fazenda? */
create or replace function game.goal_ok(p_farm uuid, p_g jsonb, p_lv int, p_prog jsonb) returns boolean language plpgsql stable set search_path = '' as $$
begin
  return case p_g ->> 'k'
    when 'stat' then coalesce((p_prog -> 'stats' ->> (p_g ->> 'key'))::int, 0) >= (p_g ->> 'n')::int
    when 'built' then game.lvl(p_farm, p_g ->> 'b') >= (p_g ->> 'lv')::int
    when 'tool' then coalesce((p_prog -> 'tools' ->> (p_g ->> 'tool'))::int, 0) >= (p_g ->> 'tier')::int
    when 'region' then (p_prog -> 'regions') ? (p_g ->> 'r')
    when 'level' then p_lv >= (p_g ->> 'n')::int
    when 'field' then game.lvl(p_farm, 'f:' || (p_g ->> 'f')) >= (p_g ->> 'lv')::int
    when 'obs' then coalesce(p_prog -> 'obs', '[]'::jsonb) ? (p_g ->> 'o')
    when 'bag' then exists (select 1 from public.farm_members where farm_id = p_farm and bag_tier >= (p_g ->> 'tier')::int)
    when 'pets' then (select count(*) from public.farm_members m, jsonb_object_keys(m.pets -> 'own') k where m.farm_id = p_farm) >= (p_g ->> 'n')::int
    else false end;
end $$;

-- ================================================================ pets
create or replace function game.pet_bonus(p_farm uuid, p_uid uuid, p_ability text, p_cat jsonb) returns numeric language plpgsql stable set search_path = '' as $$
declare v_p jsonb; v_eq text; v_def jsonb; v_xp int; v_lv int := 1; i int;
begin
  select pets into v_p from public.farm_members where farm_id = p_farm and user_id = p_uid;
  v_eq := v_p ->> 'eq';
  if v_eq is null then return 0; end if;
  v_def := p_cat -> 'pets' -> v_eq;
  if v_def is null or v_def ->> 'ability' <> p_ability then return 0; end if;
  v_xp := coalesce((v_p -> 'own' -> v_eq ->> 'xp')::int, 0);
  for i in 0 .. jsonb_array_length(p_cat -> 'petLevels') - 1 loop
    if v_xp >= (p_cat -> 'petLevels' ->> i)::int then v_lv := i + 1; end if;
  end loop;
  return (v_def -> 'values' ->> (v_lv - 1))::numeric;
end $$;

create or replace function game.pet_xp(p_farm uuid, p_uid uuid, p_n int) returns void language plpgsql set search_path = '' as $$
begin
  update public.farm_members
    set pets = jsonb_set(pets, array['own', pets ->> 'eq', 'xp'], to_jsonb(coalesce((pets -> 'own' -> (pets ->> 'eq') ->> 'xp')::int, 0) + p_n), true)
    where farm_id = p_farm and user_id = p_uid and pets ->> 'eq' is not null and pets -> 'own' ? (pets ->> 'eq');
end $$;

create or replace function game.act_pet(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'p'; v_def jsonb := p_cat -> 'pets' -> (a ->> 'p'); v_p jsonb;
begin
  if v_def is null then raise exception 'invalid'; end if;
  select pets into v_p from public.farm_members where farm_id = p_farm and user_id = p_uid;
  if v_p -> 'own' ? v_id then raise exception 'already_owned'; end if;
  perform game.require_level(p_farm, (v_def ->> 'level')::int);
  perform game.pay(p_farm, jsonb_build_object('coins', v_def -> 'price' -> 'coins'));
  perform game.pay_cr(p_farm, (v_def -> 'price' ->> 'cr')::int);
  update public.farm_members
    set pets = jsonb_set(jsonb_set(pets, array['own', v_id], '{"xp": 0}'::jsonb, true), '{eq}', to_jsonb(v_id))
    where farm_id = p_farm and user_id = p_uid;
  perform game.stat(p_farm, p_uid, 'pets', 1);
  return jsonb_build_object('pet', v_id);
end $$;

create or replace function game.act_peq(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'p'; v_p jsonb;
begin
  select pets into v_p from public.farm_members where farm_id = p_farm and user_id = p_uid;
  if v_id is not null and not v_p -> 'own' ? v_id then raise exception 'invalid'; end if;
  update public.farm_members set pets = jsonb_set(pets, '{eq}', coalesce(to_jsonb(v_id), 'null'::jsonb)) where farm_id = p_farm and user_id = p_uid;
  return '{}'::jsonb;
end $$;

-- ================================================================ personagem: melhorias e cosméticos
create or replace function game.act_perk(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'p'; v_lv int; v_def jsonb;
begin
  if p_cat -> 'perks' -> v_id is null then raise exception 'invalid'; end if;
  select coalesce((perks ->> v_id)::int, 0) into v_lv from public.farm_members where farm_id = p_farm and user_id = p_uid;
  v_def := p_cat -> 'perks' -> v_id -> v_lv;
  if v_def is null then raise exception 'max_level'; end if;
  perform game.require_level(p_farm, (v_def ->> 'level')::int);
  perform game.pay(p_farm, jsonb_build_object('coins', v_def -> 'coins'));
  update public.farm_members set perks = jsonb_set(perks, array[v_id], to_jsonb(v_lv + 1), true) where farm_id = p_farm and user_id = p_uid;
  return '{}'::jsonb;
end $$;

create or replace function game.act_cosm(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'c'; v_def jsonb := p_cat -> 'cosmetics' -> (a ->> 'c');
begin
  if v_def is null then raise exception 'invalid'; end if;
  if (select owned from public.profiles where user_id = p_uid) ? v_id then raise exception 'already_owned'; end if;
  perform game.require_level(p_farm, (v_def ->> 'level')::int);
  perform game.pay(p_farm, jsonb_build_object('coins', v_def -> 'coins'));
  perform game.pay_cr(p_farm, (v_def ->> 'cr')::int);
  update public.profiles set owned = owned || to_jsonb(v_id) where user_id = p_uid;
  return jsonb_build_object('owned', v_id);
end $$;

-- ================================================================ campos especializados
create or replace function game.plots(p_farm uuid, p_e text, p_cat jsonb) returns int language plpgsql stable set search_path = '' as $$
declare v_l int;
begin
  if p_e like 'f:%' then
    v_l := game.lvl(p_farm, p_e);
    if v_l < 1 then return 0; end if;
    return (p_cat -> 'fields' -> substr(p_e, 3) -> 'plots' ->> (v_l - 1))::int;
  elsif p_e = 'greenhouse' then
    v_l := game.lvl(p_farm, 'greenhouse');
    if v_l < 1 then return 0; end if;
    return (p_cat -> 'config' -> 'greenhousePlots' ->> (v_l - 1))::int;
  end if;
  return 0;
end $$;

/** Multiplicador de tempo de crescimento de um canteiro (poço, estufa, nível do campo). */
create or replace function game.grow_mult(p_farm uuid, p_e text, p_cat jsonb) returns numeric language plpgsql stable set search_path = '' as $$
declare v_mult numeric := 1; v_well int := game.lvl(p_farm, 'well'); v_l int;
begin
  if v_well > 0 then v_mult := 1 - (p_cat -> 'config' -> 'wellBonus' ->> (v_well - 1))::numeric; end if;
  if p_e = 'greenhouse' then v_mult := v_mult * (p_cat -> 'config' ->> 'greenhouseSpeed')::numeric;
  elsif p_e like 'f:%' then
    v_l := greatest(1, game.lvl(p_farm, p_e));
    v_mult := v_mult * (p_cat -> 'fields' -> substr(p_e, 3) -> 'speed' ->> (v_l - 1))::numeric;
  end if;
  return v_mult;
end $$;

create or replace function game.act_fopen(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'f'; v_def jsonb := p_cat -> 'fields' -> (a ->> 'f'); v_prog jsonb;
begin
  if v_def is null then raise exception 'invalid'; end if;
  if game.lvl(p_farm, 'f:' || v_id) >= 1 then raise exception 'already_built'; end if;
  select progression into v_prog from public.farms where id = p_farm;
  if not (v_prog -> 'regions') ? (v_def ->> 'region') then raise exception 'region_locked'; end if;
  perform game.require_level(p_farm, (v_def ->> 'level')::int);
  if v_def ->> 'needs' is not null and game.lvl(p_farm, v_def ->> 'needs') < 1 then raise exception 'building_required:%', v_def ->> 'needs'; end if;
  if v_def ->> 'obs' is not null and not coalesce(v_prog -> 'obs', '[]'::jsonb) ? (v_def ->> 'obs') then raise exception 'obstacle_required:%', v_def ->> 'obs'; end if;
  perform game.pay(p_farm, v_def -> 'open');
  insert into public.farm_entities (farm_id, entity_key, kind, level, state) values (p_farm, 'f:' || v_id, 'field', 1, '{"p": []}')
    on conflict (farm_id, entity_key) do update set level = 1;
  perform game.add_xp(p_farm, 15 + (v_def ->> 'level')::int * 3, p_cat);
  perform game.stat(p_farm, p_uid, 'fields', 1);
  return jsonb_build_object('e', jsonb_build_array('f:' || v_id), 'i', coalesce((select jsonb_agg(k) from jsonb_object_keys(v_def -> 'open' -> 'items') k), '[]'::jsonb));
end $$;

create or replace function game.act_fup(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'f'; v_def jsonb := p_cat -> 'fields' -> (a ->> 'f'); v_l int; v_up jsonb;
begin
  if v_def is null then raise exception 'invalid'; end if;
  v_l := game.lvl(p_farm, 'f:' || v_id);
  if v_l < 1 then raise exception 'not_built'; end if;
  v_up := v_def -> 'ups' -> (v_l - 1);
  if v_up is null then raise exception 'max_level'; end if;
  perform game.require_level(p_farm, (v_def ->> 'level')::int + 3 * v_l);
  perform game.pay(p_farm, v_up);
  update public.farm_entities set level = level + 1 where farm_id = p_farm and entity_key = 'f:' || v_id;
  perform game.add_xp(p_farm, 20 + v_l * 15, p_cat);
  return jsonb_build_object('e', jsonb_build_array('f:' || v_id), 'i', coalesce((select jsonb_agg(k) from jsonb_object_keys(v_up -> 'items') k), '[]'::jsonb));
end $$;

create or replace function game.act_plant(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_e text := a ->> 'e'; v_i int := (a ->> 'i')::int; v_c text := a ->> 'c'; v_cr jsonb; v_p jsonb;
begin
  v_cr := p_cat -> 'crops' -> v_c;
  if v_cr is null or v_i is null then raise exception 'invalid'; end if;
  if v_e like 'f:%' then
    if not (p_cat -> 'fields' -> substr(v_e, 3) -> 'crops') ? v_c then raise exception 'wrong_field'; end if;
  elsif v_e <> 'greenhouse' then raise exception 'invalid'; end if;
  perform game.require_level(p_farm, (v_cr ->> 'level')::int);
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
  v_fit := game.bag_put(p_farm, p_uid, v_item, v_q, p_cat);
  if v_fit = 0 then raise exception 'bag_full'; end if;
  update public.farms set nodes = jsonb_set(nodes, array[v_id], to_jsonb(p_now + (v_nd ->> 'respawn')::bigint * 1000)) where id = p_farm;
  perform game.add_xp(p_farm, (v_nd ->> 'xp')::int, p_cat);
  perform game.stat(p_farm, p_uid, 'h:' || v_item, v_fit, 'harvest');
  perform game.pet_xp(p_farm, p_uid, 1);
  return jsonb_build_object('q', v_fit, 'item', v_item, 'bag', true);
end $$;

-- ================================================================ aceleração
create or replace function game.act_rush(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_k text := a ->> 'k'; v_e text; v_i int; v_p jsonb; v_slot jsonb; v_total bigint; v_rem bigint; v_q jsonb; v_new jsonb := '[]'::jsonb; v_el jsonb;
begin
  if v_k = 'plot' then
    v_e := a ->> 'e'; v_i := (a ->> 'i')::int;
    select state -> 'p' into v_p from public.farm_entities where farm_id = p_farm and entity_key = v_e;
    v_slot := v_p -> v_i;
    if v_slot is null or jsonb_typeof(v_slot) = 'null' then raise exception 'plot_empty'; end if;
    v_total := ((p_cat -> 'crops' -> (v_slot ->> 0) ->> 'time')::numeric * 1000 * game.grow_mult(p_farm, v_e, p_cat))::bigint;
    v_rem := (v_slot ->> 1)::bigint + v_total - p_now;
  elsif v_k = 'craft' then
    v_e := a ->> 'b';
    select state -> 'q' into v_q from public.farm_entities where farm_id = p_farm and entity_key = v_e;
    if v_q is null or jsonb_array_length(v_q) = 0 then raise exception 'not_ready'; end if;
    v_rem := (v_q -> 0 ->> 1)::bigint - p_now;
  else raise exception 'invalid'; end if;
  if v_rem <= 0 then raise exception 'already_ready'; end if;
  -- esperas curtas em moedas; longas em cristais (1 a cada msPerCrystal)
  if v_rem <= (p_cat -> 'rush' ->> 'coinsMaxMs')::bigint then
    perform game.pay(p_farm, jsonb_build_object('coins', greatest(1, ceil(v_rem / 1000.0)::int * (p_cat -> 'rush' ->> 'coinsPerSec')::int)));
  else
    perform game.pay_cr(p_farm, greatest(1, ceil(v_rem::numeric / (p_cat -> 'rush' ->> 'msPerCrystal')::numeric)::int));
  end if;
  if v_k = 'plot' then
    update public.farm_entities set state = jsonb_set(state, array['p', v_i::text], jsonb_build_array(v_slot ->> 0, p_now - v_total - 1000))
      where farm_id = p_farm and entity_key = v_e;
  else
    for v_el in select value from jsonb_array_elements(v_q) loop
      v_new := v_new || jsonb_build_array(jsonb_build_array(v_el ->> 0, greatest(p_now, (v_el ->> 1)::bigint - v_rem)));
    end loop;
    update public.farm_entities set state = jsonb_set(state, '{q}', v_new) where farm_id = p_farm and entity_key = v_e;
  end if;
  perform game.stat(p_farm, p_uid, 'rush', 1);
  return jsonb_build_object('e', jsonb_build_array(v_e));
end $$;

-- ================================================================ clientes (fila do balcão)
create or replace function game.gen_order(p_farm uuid, p_slot int, p_cat jsonb) returns void language plpgsql set search_path = '' as $$
declare
  v_lv int; v_prog jsonb; v_cand text[]; v_pick text[]; v_n int; v_items jsonb := '{}'::jsonb; v_vip boolean;
  v_total numeric := 0; v_target numeric; v_it text; v_price int; v_q int; v_npc text; v_cr int := 0; v_coins int;
begin
  select level, progression into v_lv, v_prog from public.farms where id = p_farm;
  -- só o que a fazenda já consegue obter (região, campo, prédio e ferramenta)
  select array_agg(e.key) into v_cand from jsonb_each(p_cat -> 'items') e where game.item_ok(p_farm, e.key, p_cat, v_lv, v_prog);
  v_vip := v_lv >= 4 and random() < (p_cat -> 'config' ->> 'vipChance')::numeric;
  v_n := least(coalesce(array_length(v_cand, 1), 0), 1 + floor(random() * least(3, 1 + v_lv / 5.0))::int + case when v_vip then 1 else 0 end);
  if v_n = 0 then return; end if;
  select array_agg(x) into v_pick from (select x from unnest(v_cand) x order by random() limit v_n) s;
  v_target := (25 + v_lv * 14) * (0.75 + random() * 0.6) * case when v_vip then 1.8 else 1 end;
  foreach v_it in array v_pick loop
    v_price := (p_cat -> 'items' -> v_it ->> 'price')::int;
    v_q := least(40, greatest(1, round(v_target / v_n / v_price)::int));
    v_items := v_items || jsonb_build_object(v_it, v_q);
    v_total := v_total + v_price * v_q;
  end loop;
  if v_vip then
    v_npc := p_cat -> 'config' -> 'vipNpcs' ->> floor(random() * jsonb_array_length(p_cat -> 'config' -> 'vipNpcs'))::int;
    v_cr := 1 + case when v_lv >= 15 then 1 else 0 end;
    v_coins := round(v_total * 1.6)::int;
  else
    v_npc := p_cat -> 'npcs' ->> floor(random() * jsonb_array_length(p_cat -> 'npcs'))::int;
    v_coins := round(v_total * 1.35)::int;
  end if;
  insert into public.farm_orders (farm_id, slot, order_key, npc, items, reward, progress, status)
    values (p_farm, p_slot, case when v_vip then 'vip' else 'order' end, v_npc, v_items,
            jsonb_build_object('coins', v_coins, 'xp', round(v_total * 0.3)::int + 4, 'rep', case when v_vip then 2 else 1 end, 'cr', v_cr),
            jsonb_build_object('at', game.now_ms()), 'open')
    on conflict (farm_id, slot) do update
      set order_key = excluded.order_key, npc = excluded.npc, items = excluded.items, reward = excluded.reward,
          progress = excluded.progress, status = excluded.status;
end $$;

/** Atender um cliente: usa primeiro a mochila de quem entrega, depois o estoque da fazenda. */
create or replace function game.act_order(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_slot int := (a ->> 'o')::int; v_o record; r record; v_have int; v_take int; v_coins int; v_xp int; v_cr int;
begin
  select * into v_o from public.farm_orders where farm_id = p_farm and slot = v_slot and slot < 99;
  if not found then raise exception 'invalid'; end if;
  for r in select key, value::int as q from jsonb_each_text(v_o.items) loop
    select coalesce((bag ->> r.key)::int, 0) into v_have from public.farm_members where farm_id = p_farm and user_id = p_uid;
    v_take := least(v_have, r.q);
    if v_take > 0 then perform game.bag_take(p_farm, p_uid, r.key, v_take); end if;
    if r.q - v_take > 0 then perform game.inv_take(p_farm, r.key, r.q - v_take); end if;
  end loop;
  v_coins := round((v_o.reward ->> 'coins')::int * (1 + game.pet_bonus(p_farm, p_uid, 'coins', p_cat)))::int;
  v_xp := round((v_o.reward ->> 'xp')::int * (1 + game.pet_bonus(p_farm, p_uid, 'xp', p_cat)))::int;
  v_cr := coalesce((v_o.reward ->> 'cr')::int, 0) + case when random() < game.pet_bonus(p_farm, p_uid, 'find', p_cat) then 1 else 0 end;
  update public.farms set coins = coins + v_coins, crystals = crystals + v_cr, reputation = reputation + (v_o.reward ->> 'rep')::int where id = p_farm;
  perform game.add_xp(p_farm, v_xp, p_cat);
  perform game.stat(p_farm, p_uid, 'orders', 1, 'orders');
  perform game.pet_xp(p_farm, p_uid, 1);
  perform game.gen_order(p_farm, v_slot, p_cat);
  return jsonb_build_object('i', (select jsonb_agg(k) from jsonb_object_keys(v_o.items) k), 'o', jsonb_build_array(v_slot), 'g', v_coins, 'cr', v_cr, 'npc', v_o.npc);
end $$;

-- ================================================================ obras: prédios, regiões (obstáculos) e acessos
create or replace function game.act_give(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_k text := a ->> 'k'; v_res text := a ->> 'i'; v_q int := (a ->> 'q')::int;
  v_kind text := split_part(v_k, ':', 1); v_id text := split_part(v_k, ':', 2);
  v_key text; v_ent record; v_proj jsonb; v_def jsonb; v_up jsonb; v_need jsonb; v_regs jsonb; v_prog jsonb; v_ob jsonb;
  v_needv int; v_gotv int; v_val int; v_done boolean; r record; v_total numeric; v_share_ok int; v_coop boolean;
  v_xp int; v_old int; v_new int; s int; v_ents jsonb;
begin
  if v_q is null or v_q < 1 or v_res is null then raise exception 'invalid'; end if;
  v_key := case v_kind when 'r' then 'region:' || v_id when 'o' then 'obs:' || v_id else v_id end;
  select level, state into v_ent from public.farm_entities where farm_id = p_farm and entity_key = v_key;
  v_proj := case when v_ent is null then null else v_ent.state -> 'proj' end;
  select progression into v_prog from public.farms where id = p_farm;
  v_regs := v_prog -> 'regions';

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
      -- o obstáculo físico da entrada pede a ferramenta certa
      v_ob := p_cat -> 'obstacles' -> v_id;
      if v_ob -> 'tool' is not null and jsonb_typeof(v_ob -> 'tool') = 'object'
         and coalesce((v_prog -> 'tools' ->> (v_ob -> 'tool' ->> 't'))::int, 0) < (v_ob -> 'tool' ->> 'tier')::int then
        raise exception 'tool_required:%:%', v_ob -> 'tool' ->> 't', v_ob -> 'tool' ->> 'tier';
      end if;
      v_need := jsonb_build_object('coins', v_def -> 'coins', 'items', v_def -> 'items');
    elsif v_kind = 'o' then
      v_ob := p_cat -> 'obstacles' -> v_id;
      if v_ob is null or jsonb_typeof(v_ob -> 'cost') <> 'object' then raise exception 'invalid'; end if;
      if coalesce(v_prog -> 'obs', '[]'::jsonb) ? v_id then raise exception 'already_unlocked'; end if;
      if (v_ob ->> 'level') is not null then perform game.require_level(p_farm, (v_ob ->> 'level')::int); end if;
      if v_ob ->> 'needs' is not null and game.lvl(p_farm, v_ob ->> 'needs') < 1 then raise exception 'building_required:%', v_ob ->> 'needs'; end if;
      if not v_regs ? 'rio' then raise exception 'region_locked'; end if;
      v_need := v_ob -> 'cost';
    else
      raise exception 'invalid';
    end if;
    if (select count(*) from public.farm_entities where farm_id = p_farm and state ? 'proj') >= 4 then
      raise exception 'too_many_projects';
    end if;
    v_proj := jsonb_build_object('k', v_k, 'need', v_need, 'got', '{}'::jsonb, 'by', '{}'::jsonb, 'at', p_now);
    insert into public.farm_entities (farm_id, entity_key, kind, level, state)
      values (p_farm, v_key, case v_kind when 'r' then 'region' when 'o' then 'obstacle' else 'building' end, 0, jsonb_build_object('proj', v_proj))
      on conflict (farm_id, entity_key) do update set state = public.farm_entities.state || jsonb_build_object('proj', v_proj);
    select level, state into v_ent from public.farm_entities where farm_id = p_farm and entity_key = v_key;
  elsif v_proj ->> 'k' <> v_k then
    raise exception 'invalid';
  end if;

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
    update public.farms set progression = jsonb_set(progression, '{regions}', (progression -> 'regions') || to_jsonb(v_id)),
      crystals = crystals + coalesce((p_cat -> 'config' ->> 'regionCrystals')::int, 0) where id = p_farm;
    delete from public.farm_entities where farm_id = p_farm and entity_key = v_key;
  elsif v_kind = 'o' then
    update public.farms set progression = jsonb_set(progression, '{obs}', coalesce(progression -> 'obs', '[]'::jsonb) || to_jsonb(v_id)),
      crystals = crystals + coalesce((p_cat -> 'config' ->> 'regionCrystals')::int, 0) where id = p_farm;
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

-- ================================================================ missões
/** Gera uma missão (secundária, diária ou cooperativa) com o que a fazenda já consegue fazer. */
create or replace function game.gen_mission(p_farm uuid, p_cat jsonb, p_kind text, p_avoid text[]) returns jsonb language plpgsql set search_path = '' as $$
declare
  v_lv int; v_prog jsonb; v_cand jsonb := '[]'::jsonb; v_pick jsonb; v_key text; v_price numeric; v_n int; v_val numeric; v_members int := 1; r record; v_cr int := 0;
begin
  select level, progression into v_lv, v_prog from public.farms where id = p_farm;
  for r in select key, value from jsonb_each(p_cat -> 'items') loop
    continue when ('h:' || r.key) = any (p_avoid) or ('c:' || r.key) = any (p_avoid);
    continue when not game.item_ok(p_farm, r.key, p_cat, v_lv, v_prog);
    v_cand := v_cand || jsonb_build_array(jsonb_build_object('k', case when p_cat -> 'recipes' ? r.key then 'c:' else 'h:' end || r.key, 'p', (r.value ->> 'price')::int));
  end loop;
  if not ('orders' = any (p_avoid)) then v_cand := v_cand || '[{"k": "orders", "p": 40}]'::jsonb; end if;
  if not ('plant' = any (p_avoid)) then v_cand := v_cand || '[{"k": "plant", "p": 9}]'::jsonb; end if;
  if not ('deposit' = any (p_avoid)) then v_cand := v_cand || '[{"k": "deposit", "p": 3}]'::jsonb; end if;
  select value into v_pick from jsonb_array_elements(v_cand) order by random() limit 1;
  if v_pick is null then return null; end if;
  v_key := v_pick ->> 'k'; v_price := (v_pick ->> 'p')::numeric;
  v_val := (30 + v_lv * 10) * case p_kind when 'daily' then 1.2 when 'coop' then 3.5 else 1 end;
  if p_kind = 'coop' then
    select greatest(1, count(*)) into v_members from public.farm_members where farm_id = p_farm;
    v_val := v_val * v_members;
    v_cr := coalesce((p_cat -> 'config' ->> 'coopCrystals')::int, 0);
  elsif p_kind = 'daily' then v_cr := coalesce((p_cat -> 'config' ->> 'dailyCrystals')::int, 0);
  end if;
  v_n := round(v_val / v_price)::int;
  if v_key = 'orders' then v_n := least(case p_kind when 'coop' then 10 else 5 end, greatest(2, v_n));
  elsif v_key like 'c:%' then v_n := greatest(2, least(30, v_n / 3));
  else v_n := greatest(3, least(250, v_n)); end if;
  return jsonb_build_object('k', v_key, 'n', v_n, 'base', coalesce((v_prog -> 'stats' ->> v_key)::int, 0), 'kind', p_kind,
    'r', jsonb_build_object('coins', round(v_n * v_price * case p_kind when 'coop' then 0.8 else 0.55 end)::int + 10,
                            'xp', round(v_n * v_price * 0.14)::int + 5, 'cr', v_cr));
end $$;

/** Garante 3 secundárias, as 3 diárias do dia e 1 cooperativa. */
create or replace function game.act_mref(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_ms jsonb; v_side jsonb; v_daily jsonb; v_coop jsonb; v_today text; v_avoid text[] := '{}'; v_m jsonb; i int; v_changed boolean := false;
begin
  select coalesce(progression -> 'ms', '{}'::jsonb) into v_ms from public.farms where id = p_farm;
  v_side := coalesce(v_ms -> 'side', '[]'::jsonb);
  v_today := (now() at time zone 'America/Sao_Paulo')::date::text;
  v_daily := v_ms -> 'daily';
  v_coop := v_ms -> 'coop';
  select coalesce(array_agg(value ->> 'k'), '{}') into v_avoid from jsonb_array_elements(v_side) where jsonb_typeof(value) = 'object';
  for i in 0 .. 2 loop
    if jsonb_array_length(v_side) <= i or jsonb_typeof(v_side -> i) <> 'object' then
      v_m := game.gen_mission(p_farm, p_cat, 'side', v_avoid);
      if v_m is null then continue; end if;
      if jsonb_array_length(v_side) <= i then v_side := v_side || jsonb_build_array(v_m); else v_side := jsonb_set(v_side, array[i::text], v_m); end if;
      v_avoid := v_avoid || (v_m ->> 'k'); v_changed := true;
    end if;
  end loop;
  if v_daily is null or jsonb_typeof(v_daily) <> 'object' or v_daily ->> 'd' <> v_today then
    v_daily := jsonb_build_object('d', v_today, 'l', '[]'::jsonb);
    for i in 0 .. 2 loop
      v_m := game.gen_mission(p_farm, p_cat, 'daily', v_avoid);
      if v_m is null then continue; end if;
      v_daily := jsonb_set(v_daily, '{l}', (v_daily -> 'l') || jsonb_build_array(v_m));
      v_avoid := v_avoid || (v_m ->> 'k');
    end loop;
    v_changed := true;
  end if;
  if (v_coop is null or jsonb_typeof(v_coop) <> 'object') and (select level from public.farms where id = p_farm) >= 3 then
    v_coop := game.gen_mission(p_farm, p_cat, 'coop', v_avoid); v_changed := true;
  end if;
  if not v_changed then raise exception 'nothing_new'; end if;
  update public.farms set progression = jsonb_set(progression, '{ms}', jsonb_build_object('side', v_side, 'daily', v_daily, 'coop', coalesce(v_coop, 'null'::jsonb))) where id = p_farm;
  return '{}'::jsonb;
end $$;

create or replace function game.act_mclaim(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_s text := a ->> 's'; v_i int := coalesce((a ->> 'i')::int, 0); v_prog jsonb; v_m jsonb; v_path text[]; v_cur int; v_avoid text[];
begin
  select progression into v_prog from public.farms where id = p_farm;
  v_path := case v_s when 'side' then array['ms', 'side', v_i::text] when 'daily' then array['ms', 'daily', 'l', v_i::text] when 'coop' then array['ms', 'coop'] else null end;
  if v_path is null then raise exception 'invalid'; end if;
  v_m := v_prog #> v_path;
  if v_m is null or jsonb_typeof(v_m) <> 'object' or (v_m ->> 'done') is not null then raise exception 'invalid'; end if;
  v_cur := coalesce((v_prog -> 'stats' ->> (v_m ->> 'k'))::int, 0);
  if v_cur - (v_m ->> 'base')::int < (v_m ->> 'n')::int then raise exception 'quest_incomplete'; end if;
  update public.farms set coins = coins + (v_m -> 'r' ->> 'coins')::int, crystals = crystals + coalesce((v_m -> 'r' ->> 'cr')::int, 0) where id = p_farm;
  perform game.add_xp(p_farm, (v_m -> 'r' ->> 'xp')::int, p_cat);
  perform game.stat(p_farm, p_uid, 'missions', 1);
  select progression into v_prog from public.farms where id = p_farm;
  if v_s = 'daily' then
    v_m := v_m || '{"done": true}'::jsonb;
  else
    select coalesce(array_agg(value ->> 'k'), '{}') into v_avoid from jsonb_array_elements(coalesce(v_prog #> '{ms,side}', '[]'::jsonb)) where jsonb_typeof(value) = 'object';
    v_m := coalesce(game.gen_mission(p_farm, p_cat, v_s, v_avoid), 'null'::jsonb);
  end if;
  update public.farms set progression = jsonb_set(progression, v_path, v_m) where id = p_farm;
  return '{}'::jsonb;
end $$;

/** Missão principal: precisa das anteriores concluídas e do objetivo cumprido de verdade. */
create or replace function game.act_main(p_farm uuid, p_uid uuid, a jsonb, p_cat jsonb, p_now bigint) returns jsonb language plpgsql set search_path = '' as $$
declare v_id text := a ->> 'm'; v_def jsonb := p_cat -> 'mains' -> (a ->> 'm'); v_f record; v_done jsonb; r record;
begin
  if v_def is null then raise exception 'invalid'; end if;
  select level, progression into v_f from public.farms where id = p_farm;
  v_done := coalesce(v_f.progression -> 'mdone', '[]'::jsonb);
  if v_done ? v_id then raise exception 'already_unlocked'; end if;
  for r in select value #>> '{}' as v from jsonb_array_elements(v_def -> 'after') loop
    if not v_done ? r.v then raise exception 'quest_locked'; end if;
  end loop;
  if not game.goal_ok(p_farm, v_def -> 'goal', v_f.level, v_f.progression) then raise exception 'quest_incomplete'; end if;
  update public.farms set coins = coins + (v_def -> 'r' ->> 'coins')::int, crystals = crystals + coalesce((v_def -> 'r' ->> 'cr')::int, 0),
    progression = jsonb_set(progression, '{mdone}', v_done || to_jsonb(v_id)) where id = p_farm;
  perform game.add_xp(p_farm, (v_def -> 'r' ->> 'xp')::int, p_cat);
  return '{}'::jsonb;
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
  end;
end $$;

drop function if exists game.act_quest(uuid, uuid, jsonb, jsonb, bigint);

-- ================================================================ estado e delta
create or replace function game.members_json(p_farm uuid) returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', p.username, 'role', m.role,
    'stats', m.stats, 'look', p.character_config, 'joined_at', m.joined_at, 'bag', m.bag, 'bag_tier', m.bag_tier,
    'pets', m.pets, 'perks', m.perks, 'owned', p.owned) order by m.joined_at), '[]'::jsonb)
  from public.farm_members m join public.profiles p on p.user_id = m.user_id where m.farm_id = p_farm
$$;

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
               where m.farm_id = p_farm and m.user_id = p_uid)
  )
$$;

create or replace function public.get_farm_state(p_farm uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not game.is_member(p_farm) then raise exception 'not_member'; end if;
  return (select jsonb_build_object(
    'now', game.now_ms(),
    'farm', jsonb_build_object('id', f.id, 'name', f.name, 'owner_id', f.owner_id, 'invite_code', f.invite_code, 'level', f.level,
                               'xp', f.xp, 'coins', f.coins, 'crystals', f.crystals, 'reputation', f.reputation, 'rev', f.rev,
                               'progression', f.progression, 'nodes', f.nodes),
    'inv', (select coalesce(jsonb_object_agg(i.item_id, i.quantity), '{}'::jsonb) from public.farm_inventory i where i.farm_id = f.id),
    'ents', (select coalesce(jsonb_agg(jsonb_build_object('k', e.entity_key, 'kind', e.kind, 'level', e.level, 'state', e.state)), '[]'::jsonb)
             from public.farm_entities e where e.farm_id = f.id),
    'orders', (select coalesce(jsonb_agg(to_jsonb(o) - 'farm_id' order by o.slot), '[]'::jsonb) from public.farm_orders o where o.farm_id = f.id),
    'members', game.members_json(f.id)
  ) from public.farms f where f.id = p_farm);
end $$;

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
  insert into public.farms (name, owner_id, invite_code, coins, crystals, progression)
    values (p_name, v_uid, v_code, (v_cat -> 'config' ->> 'startCoins')::int, coalesce((v_cat -> 'config' ->> 'startCrystals')::int, 5),
            jsonb_build_object('regions', jsonb_build_array('sitio'), 'tools', jsonb_build_object('axe', 1, 'sickle', 1),
                               'quest', 0, 'contract', 0, 'stats', '{}'::jsonb, 'obs', '[]'::jsonb, 'mdone', '[]'::jsonb))
    returning id into v_id;
  insert into public.farm_members (farm_id, user_id, role) values (v_id, v_uid, 'owner');
  insert into public.farm_entities (farm_id, entity_key, kind, level, state) values
    (v_id, 'farmhouse', 'building', 1, '{}'), (v_id, 'barn', 'building', 1, '{}'),
    (v_id, 'sales_cart', 'building', 1, '{}'), (v_id, 'order_board', 'building', 1, '{}'),
    (v_id, 'f:wheat', 'field', 1, '{"p": []}');
  for r in select key, value from jsonb_each_text(v_cat -> 'config' -> 'startItems') loop
    insert into public.farm_inventory (farm_id, item_id, quantity) values (v_id, r.key, r.value::int);
  end loop;
  for i in 0 .. (v_cat -> 'config' -> 'boardSlots' ->> 0)::int - 1 loop
    perform game.gen_order(v_id, i, v_cat);
  end loop;
  perform game.gen_contract(v_id, 0, v_cat);
  return v_id;
end $$;

revoke all on all functions in schema game from public, anon, authenticated;
grant execute on function game.is_member(uuid), game.shares_farm(uuid), game.topic_member(text) to authenticated;
revoke all on function public.create_farm(text), public.get_farm_state(uuid) from public, anon;
grant execute on function public.create_farm(text), public.get_farm_state(uuid) to authenticated;

-- ================================================================ visual: itens pagos só valem se liberados
-- O jogador edita character_config, mas itens pagos só ficam se estiverem em profiles.owned
-- (que só o servidor escreve). Itens não liberados voltam ao padrão.
create or replace function game.guard_look() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cat jsonb := game.cat(); r record; v_map jsonb := '{"hat4":["hat",4],"hat5":["hat",5],"acc1":["acc",1],"acc2":["acc",2],"acc3":["acc",3],"shoes3":["shoes",3],"shoes4":["shoes",4],"shoes5":["shoes",5]}';
begin
  for r in select key, value from jsonb_each(v_map) loop
    continue when v_cat -> 'cosmetics' -> r.key is null;
    if coalesce((new.character_config ->> (r.value ->> 0))::int, -1) = (r.value ->> 1)::int and not coalesce(new.owned, '[]'::jsonb) ? r.key then
      new.character_config := jsonb_set(new.character_config, array[r.value ->> 0], '0'::jsonb);
    end if;
  end loop;
  return new;
end $$;
revoke all on function game.guard_look() from public, anon, authenticated;
drop trigger if exists guard_look on public.profiles;
create trigger guard_look before update of character_config on public.profiles for each row execute function game.guard_look();
