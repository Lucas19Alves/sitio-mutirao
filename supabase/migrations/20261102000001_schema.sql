-- Fazenda Coop: schema enxuto, RLS e autorização do Realtime.
-- Escritas de jogo acontecem SOMENTE pelas funções RPC (migration 2).

create schema if not exists game;
revoke all on schema game from public, anon;
grant usage on schema game to authenticated;

-- ---------------------------------------------------------------- tabelas
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  character_config jsonb not null default '{}'::jsonb check (pg_column_size(character_config) < 1024),
  created_at timestamptz not null default now()
);

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 32),
  owner_id uuid not null references auth.users (id) on delete cascade,
  invite_code text not null unique,
  level int not null default 1,
  xp int not null default 0,
  coins int not null default 0 check (coins >= 0),
  reputation int not null default 0,
  rev bigint not null default 0,
  progression jsonb not null default '{}'::jsonb,
  nodes jsonb not null default '{}'::jsonb, -- {nodeId: respawnAtMs}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.farm_members (
  farm_id uuid not null references public.farms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  stats jsonb not null default '{}'::jsonb,
  last_batch uuid,
  joined_at timestamptz not null default now(),
  primary key (farm_id, user_id)
);
create index farm_members_user_idx on public.farm_members (user_id);

create table public.farm_inventory (
  farm_id uuid not null references public.farms (id) on delete cascade,
  item_id text not null,
  quantity int not null check (quantity >= 0),
  primary key (farm_id, item_id)
);

-- Prédios, campo e projetos. Posição vem do catálogo (lote fixo por prédio).
create table public.farm_entities (
  farm_id uuid not null references public.farms (id) on delete cascade,
  entity_key text not null,
  kind text not null,
  level int not null default 0,
  state jsonb not null default '{}'::jsonb,
  primary key (farm_id, entity_key)
);

-- Pedidos (slots 0..4) e contrato coletivo (slot 99).
create table public.farm_orders (
  farm_id uuid not null references public.farms (id) on delete cascade,
  slot smallint not null,
  order_key text not null,
  npc text not null,
  items jsonb not null,
  reward jsonb not null,
  progress jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  primary key (farm_id, slot)
);

-- Catálogo do servidor (gerado de src/data). Esquema não exposto.
create table game.catalog (
  id int primary key default 1 check (id = 1),
  data jsonb not null
);
revoke all on game.catalog from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers de autorização
create or replace function game.is_member(fid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.farm_members m where m.farm_id = fid and m.user_id = (select auth.uid()));
$$;

create or replace function game.shares_farm(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.farm_members a join public.farm_members b on a.farm_id = b.farm_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

create or replace function game.topic_member(t text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if t is null or t !~ '^farm:[0-9a-f-]{36}$' then return false; end if;
  return exists (select 1 from public.farm_members m where m.farm_id = substr(t, 6)::uuid and m.user_id = (select auth.uid()));
end $$;

revoke all on function game.is_member(uuid), game.shares_farm(uuid), game.topic_member(text) from public, anon;
grant execute on function game.is_member(uuid), game.shares_farm(uuid), game.topic_member(text) to authenticated;

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.farms enable row level security;
alter table public.farm_members enable row level security;
alter table public.farm_inventory enable row level security;
alter table public.farm_entities enable row level security;
alter table public.farm_orders enable row level security;
alter table game.catalog enable row level security;

revoke all on public.profiles, public.farms, public.farm_members, public.farm_inventory, public.farm_entities, public.farm_orders from anon, authenticated;
grant select on public.profiles, public.farms, public.farm_members, public.farm_inventory, public.farm_entities, public.farm_orders to authenticated;
-- O único campo editável diretamente pelo cliente é a aparência do próprio personagem.
grant update (character_config) on public.profiles to authenticated;

create policy "perfil próprio ou de colegas de fazenda" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select game.shares_farm(user_id)));
create policy "editar a própria aparência" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "membros veem a fazenda" on public.farms for select to authenticated using ((select game.is_member(id)));
create policy "membros veem membros" on public.farm_members for select to authenticated using ((select game.is_member(farm_id)));
create policy "membros veem o estoque" on public.farm_inventory for select to authenticated using ((select game.is_member(farm_id)));
create policy "membros veem construções" on public.farm_entities for select to authenticated using ((select game.is_member(farm_id)));
create policy "membros veem pedidos" on public.farm_orders for select to authenticated using ((select game.is_member(farm_id)));

-- ---------------------------------------------------------------- perfil automático no cadastro
-- O username vem de app_metadata (definido pela Edge Function auth-signup; não editável pelo usuário).
create or replace function game.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uname text := lower(new.raw_app_meta_data ->> 'username');
begin
  if uname is not null and uname ~ '^[a-z0-9_]{3,20}$' then
    insert into public.profiles (user_id, username) values (new.id, uname) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function game.handle_new_user() from public, anon, authenticated;
-- o Auth insere em auth.users como supabase_auth_admin
grant usage on schema game to supabase_auth_admin;
grant execute on function game.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function game.handle_new_user();

-- ---------------------------------------------------------------- Realtime (canais privados farm:<id>)
create policy "membros recebem broadcast/presence da fazenda" on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and (select game.topic_member((select realtime.topic()))));
create policy "membros enviam broadcast/presence da fazenda" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension in ('broadcast', 'presence') and (select game.topic_member((select realtime.topic()))));
