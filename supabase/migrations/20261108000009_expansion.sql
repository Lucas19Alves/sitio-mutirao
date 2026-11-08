-- v1.3: expansão (mapa 100×80, Pastagem, Lago, Cafezal, Mata, pesca, animais, laticínios, doces,
-- bambu e açaí, nível máximo 40). Todo o conteúdo novo é catálogo (game.catalog, gerado de
-- src/data) e as funções do jogo já são genéricas; aqui só muda a proteção do visual, que agora
-- lê os itens pagos (campo e valor) do próprio catálogo.
create or replace function game.guard_look() returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select key, value from jsonb_each(coalesce(game.cat() -> 'cosmetics', '{}'::jsonb)) loop
    continue when r.value ->> 'f' is null;
    if coalesce((new.character_config ->> (r.value ->> 'f'))::int, -1) = (r.value ->> 'v')::int
       and not coalesce(new.owned, '[]'::jsonb) ? r.key then
      new.character_config := jsonb_set(new.character_config, array[r.value ->> 'f'], '0'::jsonb);
    end if;
  end loop;
  return new;
end $$;
revoke all on function game.guard_look() from public, anon, authenticated;
