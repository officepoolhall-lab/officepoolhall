-- Only approved accounts can start a pool. Anyone can still sign up — players arrive
-- through invite links — but pools are created by commissioners we know.
-- The list itself is data, managed per environment (not in migrations):
--   insert into pool_creators (email) values ('someone@example.com');

create table pool_creators (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table pool_creators enable row level security;
-- No policies: nobody reads the table directly; can_create_pools() answers for the caller.

create or replace function can_create_pools() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from pool_creators where email = lower(coalesce(auth.jwt()->>'email', ''))
  );
$$;

create or replace function create_pool(
  p_name text, p_slug text, p_sport text, p_season int, p_entry_fee numeric, p_settings jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pool_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not can_create_pools() then
    raise exception 'Starting a pool is limited to approved commissioners';
  end if;

  insert into pools (name, slug, sport, season, commissioner_id, entry_fee, settings)
  values (p_name, p_slug, p_sport, p_season, auth.uid(), coalesce(p_entry_fee, 0), p_settings)
  returning id into v_pool_id;

  insert into pool_members (pool_id, user_id, role) values (v_pool_id, auth.uid(), 'commissioner');
  insert into invites (pool_id) values (v_pool_id);

  return v_pool_id;
end;
$$;
