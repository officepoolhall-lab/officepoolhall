-- Message Board: posts and replies in a pool. Anyone in the pool (members and co-managers)
-- reads, posts and replies as themselves and can delete their own; the commissioner can
-- delete anything and pin posts (League Rules, Payouts) to the top.

create table if not exists board_posts (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  author_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  -- The newest of the post and its replies, for ordering the board.
  last_activity_at timestamptz not null default now()
);
create index if not exists board_posts_pool_idx on board_posts (pool_id, pinned desc, last_activity_at desc);

create table if not exists board_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references board_posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists board_replies_post_idx on board_replies (post_id, created_at);

alter table board_posts enable row level security;
alter table board_replies enable row level security;

drop policy if exists board_posts_read on board_posts;
drop policy if exists board_posts_insert on board_posts;
drop policy if exists board_posts_delete on board_posts;
drop policy if exists board_replies_read on board_replies;
drop policy if exists board_replies_insert on board_replies;
drop policy if exists board_replies_delete on board_replies;

create policy board_posts_read on board_posts for select using (is_pool_member(pool_id));
-- Posting as yourself, never pinned (pinning goes through set_post_pinned).
create policy board_posts_insert on board_posts for insert
  with check (author_id = auth.uid() and is_pool_member(pool_id) and not pinned);
create policy board_posts_delete on board_posts for delete
  using (author_id = auth.uid() or is_commissioner(pool_id));

create policy board_replies_read on board_replies for select
  using (exists (select 1 from board_posts p where p.id = post_id and is_pool_member(p.pool_id)));
create policy board_replies_insert on board_replies for insert
  with check (author_id = auth.uid()
              and exists (select 1 from board_posts p where p.id = post_id and is_pool_member(p.pool_id)));
create policy board_replies_delete on board_replies for delete
  using (author_id = auth.uid()
         or exists (select 1 from board_posts p where p.id = post_id and is_commissioner(p.pool_id)));

-- A reply bumps its post up the board.
create or replace function board_touch_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update board_posts set last_activity_at = greatest(last_activity_at, new.created_at) where id = new.post_id;
  return new;
end;
$$;
drop trigger if exists board_replies_touch on board_replies;
create trigger board_replies_touch after insert on board_replies for each row execute function board_touch_post();

-- The commissioner pins or unpins a post.
create or replace function set_post_pinned(p_post_id uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pool uuid;
begin
  select pool_id into v_pool from board_posts where id = p_post_id;
  if v_pool is null or not is_commissioner(v_pool) then
    raise exception 'Only the commissioner can pin posts';
  end if;
  update board_posts set pinned = p_pinned where id = p_post_id;
end;
$$;

revoke execute on function set_post_pinned(uuid, boolean) from public, anon;
grant execute on function set_post_pinned(uuid, boolean) to authenticated;
revoke execute on function board_touch_post() from public, anon, authenticated;
