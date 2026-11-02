-- A Admin API grava app_metadata num UPDATE logo após o INSERT do usuário,
-- então o perfil também precisa ser criado quando raw_app_meta_data muda.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of raw_app_meta_data on auth.users
  for each row execute function game.handle_new_user();

insert into public.profiles (user_id, username)
  select id, lower(raw_app_meta_data ->> 'username') from auth.users
  where lower(raw_app_meta_data ->> 'username') ~ '^[a-z0-9_]{3,20}$'
  on conflict do nothing;
