-- Commissioner's private notes on each player (the Roster's Notes column). Kept out of
-- pool_members, which every player in the pool can read; only the commissioner sees these.
create table if not exists pool_member_notes (
  pool_id uuid not null,
  user_id uuid not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (pool_id, user_id),
  foreign key (pool_id, user_id) references pool_members (pool_id, user_id) on delete cascade
);

alter table pool_member_notes enable row level security;

drop policy if exists member_notes_commissioner on pool_member_notes;
create policy member_notes_commissioner on pool_member_notes
  for all using (is_commissioner(pool_id)) with check (is_commissioner(pool_id));

grant select, insert, update, delete on pool_member_notes to authenticated;

-- ============ Benched entries ============
-- An entry sitting out (a season, say): still in the pool and kept on the roster, but out of
-- the standings, the Grid and the player counts, and it can't make picks until the
-- commissioner brings it back. Its own table (not a pool_members column) so the site keeps
-- working in the moments between a deploy and this migration.
create table if not exists pool_member_bench (
  pool_id uuid not null,
  user_id uuid not null,
  benched_at timestamptz not null default now(),
  primary key (pool_id, user_id),
  foreign key (pool_id, user_id) references pool_members (pool_id, user_id) on delete cascade
);

alter table pool_member_bench enable row level security;

drop policy if exists member_bench_read on pool_member_bench;
create policy member_bench_read on pool_member_bench
  for select using (pool_id = any ((select my_viewable_pools())::uuid[]));
drop policy if exists member_bench_write on pool_member_bench;
create policy member_bench_write on pool_member_bench
  for all using (is_commissioner(pool_id)) with check (is_commissioner(pool_id));

grant select, insert, update, delete on pool_member_bench to authenticated;
grant select on pool_member_bench to anon;

-- A benched entry can't pick. Checked on every picks table, whatever saves the pick (a page,
-- an RPC); the commissioner and the site's own jobs (no signed-in user) still can.
create or replace function block_benched_picks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pool uuid;
begin
  if auth.uid() is null then return new; end if;
  -- One branch per table: a record field is only looked up in the branch that runs.
  if tg_table_name = 'picks' then
    select pool_id into v_pool from slates where id = new.slate_id;
  elsif tg_table_name = 'bracket_entries' then
    select pool_id into v_pool from brackets where id = new.bracket_id;
  elsif tg_table_name = 'tournament_picks' then
    select pool_id into v_pool from tournaments where id = new.tournament_id;
  else
    v_pool := new.pool_id;
  end if;
  if v_pool is not null
     and exists (select 1 from pool_member_bench where pool_id = v_pool and user_id = new.user_id)
     and not is_commissioner(v_pool) then
    raise exception 'This entry is benched. Ask your commissioner to bring it back.';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['picks', 'golf_picks', 'golf_lineups', 'pickx_entries', 'bracket_entries', 'tournament_picks'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists block_benched on %I', t);
      execute format('create trigger block_benched before insert or update on %I for each row execute function block_benched_picks()', t);
    end if;
  end loop;
end $$;
