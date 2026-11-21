-- Would-be commissioners. Starting a pool is approval-only (pool_creators) while pricing and
-- payments are finished, so /pools/new collects a request from everyone else instead of dead-
-- ending. One row per account, updated in place. Read them in the dashboard:
--   select * from pool_creator_requests order by created_at;
-- and approve one by adding their email to pool_creators.
create table if not exists pool_creator_requests (
  user_id uuid primary key references profiles(id) on delete cascade,
  email text not null,
  -- What they want to run, their group's size, and anything else, in their words.
  pools text not null default '',
  group_size text not null default '',
  message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table pool_creator_requests enable row level security;

drop policy if exists creator_requests_own on pool_creator_requests;
create policy creator_requests_own on pool_creator_requests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on pool_creator_requests to authenticated;
