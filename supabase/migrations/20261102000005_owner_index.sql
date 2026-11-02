-- Índice da FK farms.owner_id (boas práticas: toda FK indexada; evita varredura no cascade).
create index if not exists farms_owner_idx on public.farms (owner_id);
