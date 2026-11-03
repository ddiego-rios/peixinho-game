create table if not exists public.rooms (
  id text primary key check (id ~ '^[A-Z0-9]{4}$'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.join_room(room_id text, player_id text, player_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_data jsonb;
  updated_data jsonb;
begin
  select data into current_data
  from public.rooms
  where id = room_id
  for update;

  if current_data is null then
    raise exception 'Sala não encontrada';
  end if;
  if current_data->>'status' <> 'lobby' then
    raise exception 'O jogo já começou';
  end if;
  if exists (
    select 1 from jsonb_array_elements(current_data->'players') player
    where player->>'id' = player_id
  ) then
    return current_data;
  end if;
  if jsonb_array_length(current_data->'players') >= 6 then
    raise exception 'A sala está cheia';
  end if;

  updated_data := jsonb_set(
    current_data,
    '{players}',
    (current_data->'players') || jsonb_build_array(jsonb_build_object('id', player_id, 'name', player_name, 'score', 0))
  );
  updated_data := jsonb_set(
    updated_data,
    '{logs}',
    (updated_data->'logs') || jsonb_build_array(player_name || ' entrou na sala.')
  );
  update public.rooms set data = updated_data, updated_at = now() where id = room_id;
  return updated_data;
end;
$$;

grant execute on function public.join_room(text, text, text) to anon, authenticated;

alter table public.rooms enable row level security;

drop policy if exists "rooms are readable by everyone" on public.rooms;
create policy "rooms are readable by everyone"
  on public.rooms for select
  to anon, authenticated
  using (true);

drop policy if exists "rooms can be created by everyone" on public.rooms;
create policy "rooms can be created by everyone"
  on public.rooms for insert
  to anon, authenticated
  with check (true);

drop policy if exists "rooms can be updated by everyone" on public.rooms;
create policy "rooms can be updated by everyone"
  on public.rooms for update
  to anon, authenticated
  using (true)
  with check (true);

alter table public.rooms replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end
$$;
