create table if not exists public.rooms (
  id text primary key check (id ~ '^[A-Z0-9]{4}$'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

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
