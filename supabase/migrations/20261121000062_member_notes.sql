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
