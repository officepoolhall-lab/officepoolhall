-- Three new pool formats, each an NFL pool with settings.format set and its rules in a block of
-- the same name (like Pick X), plus Pick X's tiebreaker.
--
--   survivor         one team to win each week, each team once, out after `lives` losses
--   squares          a 10 × 10 board for one game; numbers drawn once the board is ready
--   playoff_fantasy  one player from each playoff team, scored from the Wild Card round on

-- =====================================================================================
-- Survivor
-- =====================================================================================
-- settings.survivor: { lives: 1-3, tie: 'loss'|'win', reuse: bool, start_week: int }
-- Weeks are the pool's slates (Commissioner → Slate), so the scoreboard and the score poll
-- work as in every other football pool. A pick's result is read from its game, never stored.

create table if not exists survivor_picks (
  pool_id uuid not null references pools(id) on delete cascade,
  slate_id uuid not null references slates(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  game_id uuid not null references games(id),
  team_id uuid not null references teams(id),
  -- The commissioner, when they made or changed this pick for the player.
  edited_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (slate_id, user_id)
);
create index if not exists survivor_picks_entry on survivor_picks (pool_id, user_id);
alter table survivor_picks enable row level security;

-- Own pick always; entries the viewer co-manages; the commissioner (who can pick for anyone);
-- everyone else's once its game has kicked off.
drop policy if exists survivor_picks_read on survivor_picks;
create policy survivor_picks_read on survivor_picks for select using (
  user_id = (select auth.uid())
  or (pool_id::text || ':' || user_id::text) = any ((select my_managed_entries())::text[])
  or pool_id = any ((select my_commissioner_pools())::uuid[])
  or (pool_id = any ((select my_viewable_pools())::uuid[])
      and exists (select 1 from games g where g.id = survivor_picks.game_id and game_started(g.start_at, g.time_tbd, g.status))));
grant select on survivor_picks to authenticated;

/**
 * How many lives an entry has lost: a pick whose team lost (or tied, when ties count as
 * losses), and every counted week that closed (all its games under way) without a pick, from
 * the week the entry joined. The pages work this out the same way (lib/survivor.ts).
 */
create or replace function survivor_losses(p_pool_id uuid, p_user_id uuid) returns int
language sql stable security definer set search_path = public as $$
  with rules as (
    select coalesce(settings->'survivor', '{}'::jsonb) as r from pools where id = p_pool_id
  ), me as (
    select joined_at from pool_members where pool_id = p_pool_id and user_id = p_user_id
  ), weeks as (
    select sl.id,
      (select max(g.start_at) from slate_games sg join games g on g.id = sg.game_id where sg.slate_id = sl.id and not sg.voided) as last_start,
      not exists (
        select 1 from slate_games sg join games g on g.id = sg.game_id
        where sg.slate_id = sl.id and not sg.voided and not game_started(g.start_at, g.time_tbd, g.status)
      ) as closed
    from slates sl, rules
    where sl.pool_id = p_pool_id and sl.status <> 'draft'
      and sl.week >= coalesce(nullif(r->>'start_week', '')::int, 1)
  )
  select count(*)::int
  from weeks w
  cross join rules
  cross join me
  left join survivor_picks p on p.slate_id = w.id and p.user_id = p_user_id
  left join slate_games sg on sg.slate_id = w.id and sg.game_id = p.game_id
  left join games g on g.id = p.game_id
  where
    -- No pick in a week that has closed since they joined.
    (p.user_id is null and w.last_start is not null and w.closed and me.joined_at <= w.last_start)
    or
    -- A pick that lost (or tied, when ties are losses).
    (p.user_id is not null and not coalesce(sg.voided, false) and g.status = 'final'
     and coalesce(sg.override_home_score, g.home_score) is not null
     and coalesce(sg.override_away_score, g.away_score) is not null
     and (
       case when p.team_id = g.home_team_id
         then coalesce(sg.override_home_score, g.home_score) - coalesce(sg.override_away_score, g.away_score)
         else coalesce(sg.override_away_score, g.away_score) - coalesce(sg.override_home_score, g.home_score)
       end < 0
       or (coalesce(sg.override_home_score, g.home_score) = coalesce(sg.override_away_score, g.away_score)
           and coalesce(r->>'tie', 'loss') <> 'win')
     ));
$$;

/**
 * Make or change a week's pick: one team in one of the week's games. The player, a co-manager
 * of their entry, or the commissioner (who can also fix a pick after kickoff).
 */
create or replace function submit_survivor_pick(p_slate_id uuid, p_game_id uuid, p_team_id uuid, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_slate slates%rowtype;
  v_rules jsonb;
  v_commish boolean;
  v_manager boolean;
  v_behalf boolean;
  v_game games%rowtype;
  v_old games%rowtype;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select * into v_slate from slates where id = p_slate_id;
  if not found or v_slate.status = 'draft' then raise exception 'That week isn''t open'; end if;
  select settings->'survivor' into v_rules from pools where id = v_slate.pool_id and settings->>'format' = 'survivor';
  if v_rules is null then raise exception 'This isn''t a Survivor pool'; end if;

  v_commish := exists (select 1 from pool_members where pool_id = v_slate.pool_id and user_id = v_me and role = 'commissioner');
  v_manager := exists (select 1 from entry_managers where pool_id = v_slate.pool_id and owner_id = v_user and manager_id = v_me);
  if v_user <> v_me and not v_commish and not v_manager then raise exception 'You can only make your own pick'; end if;
  if not exists (select 1 from pool_members where pool_id = v_slate.pool_id and user_id = v_user) then
    raise exception 'That entry isn''t in this pool';
  end if;
  -- The commissioner fixing someone's pick isn't held to kickoff or to the entry being alive.
  v_behalf := v_commish and v_user <> v_me;

  if v_slate.week < coalesce(nullif(v_rules->>'start_week', '')::int, 1) then
    raise exception 'The pool hasn''t started yet';
  end if;

  select g.* into v_game from slate_games sg join games g on g.id = sg.game_id
  where sg.slate_id = p_slate_id and sg.game_id = p_game_id and not sg.voided;
  if not found then raise exception 'That game isn''t on this week''s slate'; end if;
  if p_team_id is distinct from v_game.home_team_id and p_team_id is distinct from v_game.away_team_id then
    raise exception 'That team isn''t playing in this game';
  end if;

  if not v_behalf then
    if game_started(v_game.start_at, v_game.time_tbd, v_game.status) then
      raise exception 'That game has already started';
    end if;
    select g.* into v_old from survivor_picks p join games g on g.id = p.game_id where p.slate_id = p_slate_id and p.user_id = v_user;
    if found and game_started(v_old.start_at, v_old.time_tbd, v_old.status) then
      raise exception 'Your pick this week is locked: its game has started';
    end if;
    if survivor_losses(v_slate.pool_id, v_user) >= coalesce(nullif(v_rules->>'lives', '')::int, 1) then
      raise exception 'This entry has been eliminated';
    end if;
  end if;

  -- Each team once, unless the pool allows repeats.
  if not coalesce((v_rules->>'reuse')::boolean, false) and exists (
    select 1 from survivor_picks where pool_id = v_slate.pool_id and user_id = v_user and team_id = p_team_id and slate_id <> p_slate_id
  ) then
    raise exception 'That team has already been used';
  end if;

  insert into survivor_picks (pool_id, slate_id, user_id, game_id, team_id, edited_by, updated_at)
  values (v_slate.pool_id, p_slate_id, v_user, p_game_id, p_team_id, case when v_behalf then v_me end, now())
  on conflict (slate_id, user_id) do update
    set game_id = excluded.game_id, team_id = excluded.team_id, edited_by = excluded.edited_by, updated_at = now();
end;
$$;

revoke execute on function survivor_losses(uuid, uuid) from public, anon;
revoke execute on function submit_survivor_pick(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function survivor_losses(uuid, uuid) to authenticated;
grant execute on function submit_survivor_pick(uuid, uuid, uuid, uuid) to authenticated;

-- =====================================================================================
-- Super Bowl Squares
-- =====================================================================================
-- settings.squares: {
--   price: number, payouts: [q1, half, q3, final] (percent),
--   entry:   'commissioner' (default: the commissioner types a name into each square)
--          | 'players' (anyone with the board's link, no account needed, taps squares, types
--            their name and saves; saved squares can only be changed by the commissioner),
--   max_per_entry: int|null (players mode: the most squares one person can take),
--   numbers: 'random' (default: drawn at random) | 'manual' (typed in)
--          | 'ordered' (0-9 in order: only for a board whose names were placed at random)
-- }
-- Squares are numbered 0-99: row * 10 + column. Columns are the home team's digit, rows the
-- away team's. The numbers can only be set once all 100 squares are filled; after that the
-- board is fixed. Works for an NFL game (the Super Bowl by default) or a college football game.

create table if not exists squares_boards (
  pool_id uuid primary key references pools(id) on delete cascade,
  -- Shown until ESPN lists the game's real teams.
  home_name text not null default 'NFC',
  away_name text not null default 'AFC',
  -- ESPN's id for the game, when the commissioner chose one; null = the season's Super Bowl,
  -- found by itself.
  game_espn_id text,
  -- The digit for each column (home) and row (away), 10 each; null until set.
  col_digits int[],
  row_digits int[],
  drawn_at timestamptz,
  -- Scores typed in by the commissioner, used ahead of ESPN's: {"1": [home, away], … "4": [home, away]},
  -- each the score at the end of that quarter (4 = the final score).
  scores jsonb not null default '{}',
  -- Anyone with this in a link (/board/<token>) can look at the board without signing in.
  share_token uuid not null default gen_random_uuid() unique,
  -- Every name on the board was placed by the random fill (and none changed by hand since):
  -- what makes numbers in 0-9 order fair.
  random_filled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table squares_boards enable row level security;
drop policy if exists squares_boards_read on squares_boards;
create policy squares_boards_read on squares_boards for select using (pool_id = any ((select my_viewable_pools())::uuid[]));
drop policy if exists squares_boards_write on squares_boards;
create policy squares_boards_write on squares_boards for all using (is_commissioner(pool_id)) with check (is_commissioner(pool_id));
grant select, insert, update on squares_boards to authenticated;

create table if not exists squares_claims (
  pool_id uuid not null references pools(id) on delete cascade,
  idx int not null check (idx between 0 and 99),
  -- The name written on the square.
  label text not null check (char_length(label) between 1 and 24),
  -- Who saved it through the board's link: a random id kept in their browser (so their own
  -- squares can be shown to them). Null when the commissioner wrote the name.
  owner_key text,
  claimed_at timestamptz not null default now(),
  primary key (pool_id, idx)
);
create index if not exists squares_claims_owner on squares_claims (pool_id, owner_key);
alter table squares_claims enable row level security;
-- Everyone in the pool sees the whole board. (People with the link read it through the site.)
drop policy if exists squares_claims_read on squares_claims;
create policy squares_claims_read on squares_claims for select using (pool_id = any ((select my_viewable_pools())::uuid[]));
grant select on squares_claims to authenticated;

-- A square someone has tapped but not saved yet: held for them for a few minutes so nobody
-- else can take it, and shown to everyone else as being filled in.
create table if not exists squares_holds (
  pool_id uuid not null references pools(id) on delete cascade,
  idx int not null check (idx between 0 and 99),
  holder text not null,
  expires_at timestamptz not null,
  primary key (pool_id, idx)
);
alter table squares_holds enable row level security;
-- No policies: holds are only read and written through the functions below.

/** The commissioner writes (or changes) the name on any square, until the numbers are set. */
create or replace function claim_square(p_pool_id uuid, p_idx int, p_label text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from pools where id = p_pool_id and settings->>'format' = 'squares') then
    raise exception 'This isn''t a Squares pool';
  end if;
  if not is_commissioner(p_pool_id) then raise exception 'Only the commissioner can write on a square here'; end if;
  if p_idx is null or p_idx < 0 or p_idx > 99 then raise exception 'No such square'; end if;
  if exists (select 1 from squares_boards where pool_id = p_pool_id and drawn_at is not null) then
    raise exception 'The numbers are set, so the board is locked';
  end if;
  if v_label is null then raise exception 'Type the name for the square'; end if;
  if char_length(v_label) > 24 then raise exception 'Keep the name to 24 characters'; end if;
  -- A square changed by hand: the board is no longer a purely random one.
  update squares_boards set random_filled = false where pool_id = p_pool_id and random_filled;
  delete from squares_holds where pool_id = p_pool_id and idx = p_idx;
  insert into squares_claims (pool_id, idx, label, owner_key) values (p_pool_id, p_idx, v_label, null)
  on conflict (pool_id, idx) do update set label = excluded.label, claimed_at = now();
end;
$$;

/** The commissioner clears a square, until the numbers are set. A saved square can't be changed by anyone else. */
create or replace function release_square(p_pool_id uuid, p_idx int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not is_commissioner(p_pool_id) then raise exception 'Only the commissioner can clear a saved square'; end if;
  if exists (select 1 from squares_boards where pool_id = p_pool_id and drawn_at is not null) then
    raise exception 'The numbers are set, so the board is locked';
  end if;
  delete from squares_claims where pool_id = p_pool_id and idx = p_idx;
  update squares_boards set random_filled = false where pool_id = p_pool_id and random_filled;
end;
$$;

-- ---------- Filling the board through its link (no account) ----------
-- Called by the site with the service role, for whoever has the board's link (its share
-- token). `p_holder` is the random id their browser keeps.

/** The pool behind a share link, if people may fill it in through the link right now. Raises otherwise. */
create or replace function squares_open_pool(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_pool uuid;
  v_drawn timestamptz;
begin
  select b.pool_id, b.drawn_at into v_pool, v_drawn from squares_boards b where b.share_token = p_token;
  if v_pool is null then raise exception 'This board''s link isn''t valid'; end if;
  if v_drawn is not null then raise exception 'The numbers are set, so the board is locked'; end if;
  if coalesce((select settings->'squares'->>'entry' from pools where id = v_pool), 'commissioner') <> 'players' then
    raise exception 'The commissioner fills in this board';
  end if;
  return v_pool;
end;
$$;

/** Hold an open square for three minutes while its name is typed and saved. */
create or replace function squares_hold(p_token uuid, p_idx int, p_holder text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pool uuid := squares_open_pool(p_token);
  v_max int;
begin
  if p_idx is null or p_idx < 0 or p_idx > 99 then raise exception 'No such square'; end if;
  if coalesce(char_length(p_holder), 0) not between 8 and 64 then raise exception 'Reload the page and try again'; end if;
  if exists (select 1 from squares_claims where pool_id = v_pool and idx = p_idx) then
    raise exception 'That square is taken';
  end if;
  if exists (select 1 from squares_holds where pool_id = v_pool and idx = p_idx and holder <> p_holder and expires_at > now()) then
    raise exception 'Someone else is filling in that square right now';
  end if;
  select nullif(settings->'squares'->>'max_per_entry', '')::int into v_max from pools where id = v_pool;
  if v_max is not null and (
       (select count(*) from squares_claims where pool_id = v_pool and owner_key = p_holder)
     + (select count(*) from squares_holds where pool_id = v_pool and holder = p_holder and idx <> p_idx)) >= v_max then
    raise exception 'Each person can take up to % squares', v_max;
  end if;
  insert into squares_holds (pool_id, idx, holder, expires_at) values (v_pool, p_idx, p_holder, now() + interval '3 minutes')
  on conflict (pool_id, idx) do update set holder = excluded.holder, expires_at = excluded.expires_at;
end;
$$;

/** Let go of a square that was tapped but not saved. */
create or replace function squares_unhold(p_token uuid, p_idx int, p_holder text) returns void
language sql security definer set search_path = public as $$
  delete from squares_holds h using squares_boards b
  where b.share_token = p_token and h.pool_id = b.pool_id and h.idx = p_idx and h.holder = p_holder;
$$;

/** Save every square this person is holding under one name. Saved squares can then only be changed by the commissioner. */
create or replace function squares_save_holds(p_token uuid, p_holder text, p_label text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_pool uuid := squares_open_pool(p_token);
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_n int;
begin
  if v_label is null then raise exception 'Type your name first'; end if;
  if char_length(v_label) > 24 then raise exception 'Keep the name to 24 characters'; end if;
  with mine as (
    delete from squares_holds where pool_id = v_pool and holder = p_holder returning idx
  ), saved as (
    insert into squares_claims (pool_id, idx, label, owner_key)
    select v_pool, idx, v_label, p_holder from mine
    on conflict (pool_id, idx) do nothing
    returning 1
  )
  select count(*) into v_n from saved;
  if v_n = 0 then raise exception 'Tap the squares you want first (a square is held for three minutes)'; end if;
  update squares_boards set random_filled = false where pool_id = v_pool and random_filled;
  return v_n;
end;
$$;

revoke execute on function squares_open_pool(uuid), squares_hold(uuid, int, text), squares_unhold(uuid, int, text), squares_save_holds(uuid, text, text) from public, anon, authenticated;
grant execute on function squares_open_pool(uuid), squares_hold(uuid, int, text), squares_unhold(uuid, int, text), squares_save_holds(uuid, text, text) to service_role;

/**
 * Fill the board at random: each name gets its number of squares, on squares chosen by chance.
 * Replaces whatever was on the board. Commissioner only, until the numbers are set.
 */
create or replace function squares_fill_random(p_pool_id uuid, p_names text[], p_counts int[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_total int;
begin
  if not is_commissioner(p_pool_id) then raise exception 'Only the commissioner can fill the board'; end if;
  if not exists (select 1 from pools where id = p_pool_id and settings->>'format' = 'squares') then
    raise exception 'This isn''t a Squares pool';
  end if;
  if exists (select 1 from squares_boards where pool_id = p_pool_id and drawn_at is not null) then
    raise exception 'The numbers are set, so the board is locked';
  end if;
  if coalesce(array_length(p_names, 1), 0) = 0 or array_length(p_names, 1) is distinct from array_length(p_counts, 1) then
    raise exception 'Enter each name with its number of squares';
  end if;
  if exists (select 1 from unnest(p_names) n where char_length(btrim(coalesce(n, ''))) not between 1 and 24) then
    raise exception 'Each name has to be 1 to 24 characters';
  end if;
  if exists (select 1 from unnest(p_counts) c where c is null or c < 1) then
    raise exception 'Each name needs at least 1 square';
  end if;
  select sum(c) into v_total from unnest(p_counts) c;
  if v_total > 100 then raise exception 'That''s % squares; the board has 100', v_total; end if;

  delete from squares_claims where pool_id = p_pool_id;
  delete from squares_holds where pool_id = p_pool_id;
  -- One row per square owed, matched to the board's squares in a random order.
  insert into squares_claims (pool_id, idx, label, owner_key)
  select p_pool_id, spot.idx, owed.label, null
  from (
    select btrim(n.name) as label, row_number() over (order by n.ord, g) as rn
    from unnest(p_names, p_counts) with ordinality as n(name, cnt, ord), generate_series(1, n.cnt) g
  ) owed
  join (select i as idx, row_number() over (order by random()) as rn from generate_series(0, 99) i) spot using (rn);

  insert into squares_boards (pool_id, random_filled) values (p_pool_id, true)
  on conflict (pool_id) do update set random_filled = true, updated_at = now();
end;
$$;

/**
 * Set the board's numbers (which locks it), or clear them to reopen it. Commissioner only.
 * Given both rows of digits, those are used (each has to be 0-9 once); otherwise the pool's
 * setting decides: in order, or (the default) a random draw.
 */
create or replace function squares_draw(p_pool_id uuid, p_clear boolean default false, p_cols int[] default null, p_rows int[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ordered boolean;
  v_open int;
  v_all int[] := array[0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
begin
  if not is_commissioner(p_pool_id) then raise exception 'Only the commissioner can set the numbers'; end if;
  insert into squares_boards (pool_id) values (p_pool_id) on conflict (pool_id) do nothing;
  if p_clear then
    update squares_boards set col_digits = null, row_digits = null, drawn_at = null, updated_at = now() where pool_id = p_pool_id;
    return;
  end if;
  if exists (select 1 from squares_boards where pool_id = p_pool_id and drawn_at is not null) then
    raise exception 'The numbers are already set';
  end if;
  -- The numbers only go on a full board.
  select 100 - count(*) into v_open from squares_claims where pool_id = p_pool_id;
  if v_open > 0 then
    raise exception 'The board still has % open square%. Fill every square before setting the numbers.', v_open, case when v_open = 1 then '' else 's' end;
  end if;
  delete from squares_holds where pool_id = p_pool_id;
  if p_cols is not null or p_rows is not null then
    if (select array_agg(d order by d) from unnest(p_cols) d) is distinct from v_all
       or (select array_agg(d order by d) from unnest(p_rows) d) is distinct from v_all then
      raise exception 'Each side needs every digit from 0 to 9 exactly once';
    end if;
    update squares_boards set col_digits = p_cols, row_digits = p_rows, drawn_at = now(), updated_at = now() where pool_id = p_pool_id;
    return;
  end if;
  select coalesce(settings->'squares'->>'numbers', 'random') = 'ordered' into v_ordered from pools where id = p_pool_id;
  -- In order is only fair when chance decided who sits where.
  if v_ordered and not (select random_filled from squares_boards where pool_id = p_pool_id) then
    raise exception 'Numbers in 0-9 order are only for a board filled at random. Fill the board at random, or switch the pool to a random draw.';
  end if;
  update squares_boards set
    col_digits = case when v_ordered then v_all else (select array_agg(d order by random()) from generate_series(0, 9) d) end,
    row_digits = case when v_ordered then v_all else (select array_agg(d order by random()) from generate_series(0, 9) d) end,
    drawn_at = now(), updated_at = now()
  where pool_id = p_pool_id;
end;
$$;

revoke execute on function claim_square(uuid, int, text) from public, anon;
revoke execute on function release_square(uuid, int) from public, anon;
revoke execute on function squares_draw(uuid, boolean, int[], int[]) from public, anon;
revoke execute on function squares_fill_random(uuid, text[], int[]) from public, anon;
grant execute on function squares_fill_random(uuid, text[], int[]) to authenticated;
grant execute on function claim_square(uuid, int, text) to authenticated;
grant execute on function release_square(uuid, int) to authenticated;
grant execute on function squares_draw(uuid, boolean, int[], int[]) to authenticated;

-- =====================================================================================
-- NFL Playoff Fantasy
-- =====================================================================================
-- settings.playoff_fantasy: { lock_at: timestamptz|null, roster: {QB, RB, WR, TE, K, DEF}, scoring: {…} }
-- The commissioner chooses the playoff teams and loads their players; each entry takes one
-- player from each team to fill the roster. Points are worked out from ESPN's box scores when
-- a page is read (lib/playoffFantasyData.ts), so nothing is stored but the lineups.

create table if not exists pf_teams (
  pool_id uuid not null references pools(id) on delete cascade,
  team_id uuid not null references teams(id),
  primary key (pool_id, team_id)
);
create table if not exists pf_players (
  pool_id uuid not null references pools(id) on delete cascade,
  -- ESPN's player id; a team's defense is 'DEF-' || the team's ESPN id.
  espn_id text not null,
  name text not null,
  pos text not null check (pos in ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')),
  team_id uuid not null references teams(id),
  primary key (pool_id, espn_id)
);
create table if not exists pf_lineups (
  pool_id uuid not null references pools(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  player_ids text[] not null default '{}',
  edited_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);
alter table pf_teams enable row level security;
alter table pf_players enable row level security;
alter table pf_lineups enable row level security;

drop policy if exists pf_teams_read on pf_teams;
create policy pf_teams_read on pf_teams for select using (pool_id = any ((select my_viewable_pools())::uuid[]));
drop policy if exists pf_teams_write on pf_teams;
create policy pf_teams_write on pf_teams for all using (is_commissioner(pool_id)) with check (is_commissioner(pool_id));
drop policy if exists pf_players_read on pf_players;
create policy pf_players_read on pf_players for select using (pool_id = any ((select my_viewable_pools())::uuid[]));
drop policy if exists pf_players_write on pf_players;
create policy pf_players_write on pf_players for all using (is_commissioner(pool_id)) with check (is_commissioner(pool_id));
grant select, insert, update, delete on pf_teams, pf_players to authenticated;

-- Own lineup always; entries the viewer co-manages; the commissioner (who can set a roster for
-- anyone); everyone's once lineups lock.
drop policy if exists pf_lineups_read on pf_lineups;
create policy pf_lineups_read on pf_lineups for select using (
  user_id = (select auth.uid())
  or (pool_id::text || ':' || user_id::text) = any ((select my_managed_entries())::text[])
  or pool_id = any ((select my_commissioner_pools())::uuid[])
  or (pool_id = any ((select my_viewable_pools())::uuid[])
      and exists (
        select 1 from pools p where p.id = pf_lineups.pool_id
          and nullif(p.settings->'playoff_fantasy'->>'lock_at', '')::timestamptz <= now())));
grant select on pf_lineups to authenticated;

/**
 * Save an entry's lineup (all of it each time; it can be part-filled until the lock). Checks
 * the roster's size by position and that no two players share a team.
 */
create or replace function submit_pf_lineup(p_pool_id uuid, p_player_ids text[], p_user_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_rules jsonb;
  v_commish boolean;
  v_manager boolean;
  v_lock timestamptz;
  v_count int;
  v_found int;
  v_pos record;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select settings->'playoff_fantasy' into v_rules from pools where id = p_pool_id and settings->>'format' = 'playoff_fantasy';
  if v_rules is null then raise exception 'This isn''t a Playoff Fantasy pool'; end if;

  v_commish := exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_me and role = 'commissioner');
  v_manager := exists (select 1 from entry_managers where pool_id = p_pool_id and owner_id = v_user and manager_id = v_me);
  if v_user <> v_me and not v_commish and not v_manager then raise exception 'You can only set your own lineup'; end if;
  if not exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_user) then
    raise exception 'That entry isn''t in this pool';
  end if;

  v_lock := nullif(v_rules->>'lock_at', '')::timestamptz;
  if v_lock is not null and v_lock <= now() and not (v_commish and v_user <> v_me) then
    raise exception 'Lineups are locked';
  end if;

  p_player_ids := coalesce(p_player_ids, '{}');
  v_count := coalesce(array_length(p_player_ids, 1), 0);
  if (select count(distinct x) from unnest(p_player_ids) x) <> v_count then
    raise exception 'Each player can only be picked once';
  end if;
  select count(*) into v_found from pf_players where pool_id = p_pool_id and espn_id = any (p_player_ids);
  if v_found <> v_count then raise exception 'Every pick has to be a player in the pool''s player list'; end if;

  -- One player from each team.
  if exists (
    select 1 from pf_players where pool_id = p_pool_id and espn_id = any (p_player_ids) group by team_id having count(*) > 1
  ) then
    raise exception 'Only one player from each team';
  end if;

  -- No more at a position than the roster has spots.
  for v_pos in
    select pos, count(*) as n from pf_players where pool_id = p_pool_id and espn_id = any (p_player_ids) group by pos
  loop
    if v_pos.n > coalesce(nullif(v_rules->'roster'->>v_pos.pos, '')::int, 0) then
      raise exception 'Too many at % for this roster', v_pos.pos;
    end if;
  end loop;

  insert into pf_lineups (pool_id, user_id, player_ids, edited_by, updated_at)
  values (p_pool_id, v_user, p_player_ids, case when v_user <> v_me and v_commish then v_me end, now())
  on conflict (pool_id, user_id) do update
    set player_ids = excluded.player_ids, edited_by = excluded.edited_by, updated_at = now();
end;
$$;

revoke execute on function submit_pf_lineup(uuid, text[], uuid) from public, anon;
grant execute on function submit_pf_lineup(uuid, text[], uuid) to authenticated;

-- =====================================================================================
-- Benched entries can't pick in the new formats either (see 062)
-- =====================================================================================
do $$
declare t text;
begin
  foreach t in array array['survivor_picks', 'pf_lineups'] loop
    execute format('drop trigger if exists block_benched on %I', t);
    execute format('create trigger block_benched before insert or update on %I for each row execute function block_benched_picks()', t);
  end loop;
end $$;

-- =====================================================================================
-- Pick X: the tiebreaker
-- =====================================================================================
-- settings.pick_x.tiebreaker = 'title_total': each entry guesses the championship game's total
-- points; the closest guess wins a tie. The real total is settings.pick_x.title_total.
alter table pickx_entries add column if not exists tiebreak int check (tiebreak between 0 and 999);

/** Save an entry's tiebreaker guess. Same people and the same lock as the picks themselves. */
create or replace function submit_pickx_tiebreak(p_pool_id uuid, p_tiebreak int, p_user_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_commish boolean;
  v_manager boolean;
  v_lock timestamptz;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from pools where id = p_pool_id and settings->>'format' = 'pick_x') then
    raise exception 'This isn''t a Pick X pool';
  end if;
  v_commish := exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_me and role = 'commissioner');
  v_manager := exists (select 1 from entry_managers where pool_id = p_pool_id and owner_id = v_user and manager_id = v_me);
  if v_user <> v_me and not v_commish and not v_manager then raise exception 'You can only make your own picks'; end if;
  if not exists (select 1 from pool_members where pool_id = p_pool_id and user_id = v_user) then
    raise exception 'That entry isn''t in this pool';
  end if;
  select lock_at into v_lock from brackets where pool_id = p_pool_id order by created_at desc limit 1;
  if v_lock is not null and v_lock <= now() and not (v_commish and v_user <> v_me) then
    raise exception 'Picks are locked';
  end if;
  if p_tiebreak is not null and (p_tiebreak < 0 or p_tiebreak > 999) then raise exception 'Enter a total between 0 and 999'; end if;
  insert into pickx_entries (pool_id, user_id, tiebreak, updated_at) values (p_pool_id, v_user, p_tiebreak, now())
  on conflict (pool_id, user_id) do update set tiebreak = excluded.tiebreak, updated_at = now();
end;
$$;
revoke execute on function submit_pickx_tiebreak(uuid, int, uuid) from public, anon;
grant execute on function submit_pickx_tiebreak(uuid, int, uuid) to authenticated;
