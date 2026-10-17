-- Core schema (HANDOFF.md §4).

-- ============ Reference data ============

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Every new auth user gets a profile. Display name defaults to the email's local part.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table teams (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('ncaab','ncaaf')),
  name text not null,              -- display name, e.g. 'Miami (FL)'
  short_name text,
  abbreviation text,
  conference text,                 -- for the slate editor's conference filter
  espn_id text,
  odds_api_name text,              -- exact string The Odds API uses
  logo_url text,
  unique (sport, espn_id)
);
-- Team name matching between ESPN and The Odds API is the #1 data bug source.
-- Ingestion matches via teams.odds_api_name; unmatched names land in team_match_queue,
-- never silently dropped.

create table team_match_queue (
  id bigint generated always as identity primary key,
  sport text not null check (sport in ('ncaab','ncaaf')),
  source text not null check (source in ('espn','odds_api')),
  raw_name text not null,
  raw_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved boolean not null default false,
  unique (sport, source, raw_name)
);

create table games (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('ncaab','ncaaf')),
  season int not null,             -- season start year (2026 for 2026-27)
  home_team_id uuid not null references teams(id),
  away_team_id uuid not null references teams(id),
  neutral_site boolean not null default false,
  start_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','in_progress','final','postponed','cancelled')),
  home_score int,
  away_score int,
  espn_id text unique,
  odds_api_id text unique,
  tv_network text,
  home_rank int, away_rank int,    -- AP rank at slate time; used later for upset bonus
  updated_at timestamptz not null default now()
);
create index on games (sport, start_at);

-- Every line pull is a new row; never overwrite.
create table game_lines (
  id bigint generated always as identity primary key,
  game_id uuid not null references games(id) on delete cascade,
  bookmaker text not null,
  home_spread numeric(4,1),        -- negative = home favored
  home_moneyline int,
  away_moneyline int,
  captured_at timestamptz not null default now()
);
create index on game_lines (game_id, captured_at desc);

-- ============ Pools ============

create table pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sport text not null check (sport in ('ncaab','ncaaf')),
  season int not null,
  commissioner_id uuid not null references profiles(id),
  entry_fee numeric(10,2) not null default 0,
  settings jsonb not null,         -- see §5; validated in app with zod (lib/poolSettings.ts)
  created_at timestamptz not null default now()
);

create table pool_members (
  pool_id uuid references pools(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('commissioner','player')),
  paid boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);
create index on pool_members (user_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  token text unique not null default encode(extensions.gen_random_bytes(16),'hex'),
  max_uses int,                    -- null = unlimited (one shareable link)
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ Weekly slates ============

create table slates (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  week int not null,
  label text,                      -- 'Week 1', 'Feast Week', etc.
  window_start timestamptz not null,
  window_end timestamptz not null,
  lock_at timestamptz,             -- weekly lock mode only; null in per_game mode
  status text not null default 'draft'
    check (status in ('draft','open','locked','graded')),
    -- open = picks allowed on unstarted games; locked = every game started (or weekly lock passed)
  published_at timestamptz,        -- lines are frozen at this moment (ATS)
  unique (pool_id, week),
  check (window_end > window_start)
);

create table slate_games (
  slate_id uuid references slates(id) on delete cascade,
  game_id uuid references games(id),
  sort_order int,
  locked_home_spread numeric(4,1), -- written once, at publish (ATS pools)
  locked_line_id bigint references game_lines(id),
  voided boolean not null default false,
  -- Commissioner result override. Lives here rather than on games so the score
  -- poller can't overwrite a fix, and a fix in one pool doesn't touch another.
  override_home_score int,
  override_away_score int,
  check ((override_home_score is null) = (override_away_score is null)),
  primary key (slate_id, game_id)
);
create index on slate_games (game_id);

-- ============ Picks ============

create table picks (
  id uuid primary key default gen_random_uuid(),
  slate_id uuid not null references slates(id) on delete cascade,
  game_id uuid not null references games(id),
  user_id uuid not null references profiles(id),
  picked_side text not null check (picked_side in ('home','away')),
  confidence int check (confidence between 1 and 10),  -- null for non-confidence pools
  result text check (result in ('win','loss','push','void')),
  points numeric(5,2),
  updated_at timestamptz not null default now(),
  unique (slate_id, user_id, game_id),
  foreign key (slate_id, game_id) references slate_games(slate_id, game_id) on delete cascade
);
create index on picks (slate_id, user_id);
create index on picks (game_id);

-- Denormalized weekly totals, recomputed by the grader
create table slate_scores (
  slate_id uuid references slates(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  points numeric(7,2) not null default 0,
  wins int not null default 0, losses int not null default 0, pushes int not null default 0,
  primary key (slate_id, user_id)
);

-- Commissioner actions log (overrides, result edits, lock extensions)
create table audit_log (
  id bigint generated always as identity primary key,
  pool_id uuid references pools(id) on delete cascade,
  actor_id uuid references profiles(id),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (pool_id, created_at desc);
