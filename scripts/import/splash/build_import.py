"""Splash "Picks by Week" rows (parse.py output) -> one all-or-nothing SQL import for an NFL
Supercontest pool. Usage: python3 -I build_import.py <out dir with Week_N.rows.json> <weeks e.g. 1-10> <pool name> <out.sql>
"""
import json, re, sys

src, weeks_arg, pool_name, out = sys.argv[1:5]
a, b = (weeks_arg.split("-") + [weeks_arg])[:2]
WEEKS = list(range(int(a), int(b) + 1))

entries = {}  # (username, entry) -> index
games, picks, points = [], [], []
problems = []

for wk in WEEKS:
    rows = json.load(open(f"{src}/Week_{wk}.rows.json"))
    hdr = [r for r in rows if r and r[0].startswith("Rank | Entrant")]
    if len(hdr) != 1:
        problems.append(f"week {wk}: header rows {len(hdr)}")
        continue
    gcols = []
    for i, c in enumerate(hdr[0][1:]):
        p = c.split(" | ")
        if p[0] != "FINAL":
            problems.append(f"week {wk}: game {p[1]} is {p[0]}, not FINAL")
        away, home = p[1].split(" @ ")
        assert p[2] == away and p[4] == home, p
        gcols.append({"week": wk, "ord": i + 1, "away": away, "home": home,
                      "away_score": int(p[3]), "home_score": int(p[5]), "home_spread": None})
    seen = set()
    for r in rows:
        if not (r and r[0].startswith("Rank | ") and len(r[0].split(" | ")) > 5):
            continue
        h = r[0].split(" | ")
        key = (h[2], h[3])
        if key in seen:
            problems.append(f"week {wk}: {key} twice")
        seen.add(key)
        k = entries.setdefault(key, len(entries))
        my = 0.0
        for g, c in zip(gcols, r[1:]):
            if c.startswith("No pick") or "Missing" in c:
                continue
            p = c.split(" | ")
            team, line = p[0], (0.0 if p[1] in ("PK", "") else float(p[1]))
            if team not in (g["away"], g["home"]):
                problems.append(f"week {wk}: {key} picked {team} in {g['away']}@{g['home']}")
                continue
            side = "home" if team == g["home"] else "away"
            hs = line if side == "home" else -line
            if g["home_spread"] is None:
                g["home_spread"] = hs
            elif g["home_spread"] != hs:
                problems.append(f"week {wk}: {g['away']}@{g['home']} lines disagree ({g['home_spread']} vs {hs})")
            last = p[-1]
            res = "loss" if "incorrect" in last else "push" if "push" in last else "win" if "correct" in last else None
            if res is None:
                problems.append(f"week {wk}: {key} unknown result {last!r}")
                continue
            # Splash's result must follow from its own score and line.
            m = (g["home_score"] - g["away_score"]) * (1 if side == "home" else -1) + line
            calc = "push" if m == 0 else "win" if m > 0 else "loss"
            if calc != res:
                problems.append(f"week {wk}: {key} {team} {line}: Splash says {res}, scores say {calc}")
            my += {"win": 1, "push": 0.5}.get(res, 0)
            picks.append([wk, g["ord"], k, side, res])
        if my != float(h[5]):
            problems.append(f"week {wk}: {key} picks add to {my}, Splash shows {h[5]}")
        points.append([wk, k, float(h[5])])
    for g in gcols:
        if g["home_spread"] is None:
            problems.append(f"week {wk}: nobody picked {g['away']}@{g['home']} (no line)")
    games += gcols
    if len(seen) != 134:
        print(f"note: week {wk} has {len(seen)} entries", file=sys.stderr)

if problems:
    print("\n".join(problems), file=sys.stderr)
    sys.exit(1)

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "entry"

two = {u for (u, e) in entries if e != "Entry 1"}
ent = []
emails = set()
for (u, e), k in sorted(entries.items(), key=lambda x: x[1]):
    n = re.sub(r"\D", "", e) or "1"
    name = u if n == "1" else f"{u} (Entry {n})"
    email = f"splash-{slug(u)}{'' if n == '1' else '-' + n}@rt-supercontest.invalid"
    assert email not in emails, email
    emails.add(email)
    ent.append({"k": k, "username": u, "entry": e, "name": name[:100], "email": email})

payload = {"entries": ent, "games": games, "picks": picks, "points": points}
js = json.dumps(payload, separators=(",", ":"))
assert "$json$" not in js
lit = lambda s: "'" + s.replace("'", "''") + "'"

sql = f"""-- Splash Sports NFL Supercontest import: weeks {WEEKS[0]}-{WEEKS[-1]} into the pool named {pool_name}.
-- One statement, so it is all-or-nothing. Safe to re-run: it replaces these weeks' games and
-- picks and leaves everything else alone. Needs ESPN's NFL games for these weeks in the
-- database first (sync-ranks backfill).
--
-- Each Splash entry becomes an account named after its username, with a placeholder email
-- (…@rt-supercontest.invalid) so nobody is emailed. Real names and emails replace these later.
do $import$
declare
  v_pool_name constant text := {lit(pool_name)};
  v_season constant int := 2026;
  v_data constant jsonb := $json${js}$json$::jsonb;
  v_pool pools%rowtype;
  v_n int;
  v_m int;
  v_wk int;
  v_slate_id uuid;
  v_first timestamptz;
  v_bad text;
  v_win_start timestamptz;
begin
  -- The pool: exactly one NFL pool with this name, Supercontest rules.
  select count(*) into v_n from pools where name = v_pool_name;
  if v_n <> 1 then
    raise exception 'Expected one pool named %, found %', v_pool_name, v_n;
  end if;
  select * into v_pool from pools where name = v_pool_name for update;
  if v_pool.sport <> 'nfl' or v_pool.settings->>'pick_type' <> 'ats' or v_pool.season <> v_season then
    raise exception 'Pool % is %/%/% - expected nfl/ats/%', v_pool_name, v_pool.sport,
      v_pool.settings->>'pick_type', v_pool.season, v_season;
  end if;
  if coalesce(jsonb_typeof(v_pool.settings->'confidence'), 'null') <> 'null'
     or coalesce(jsonb_typeof(v_pool.settings->'upset_bonus'), 'null') <> 'null'
     or (v_pool.settings->'scoring'->>'win')::numeric is distinct from 1
     or (v_pool.settings->'scoring'->>'push')::numeric is distinct from 0.5
     or (v_pool.settings->'scoring'->>'loss')::numeric is distinct from 0
     or (v_pool.settings->>'picks_per_slate')::int is distinct from 5 then
    raise exception 'Pool % rules differ from Splash (need 5 picks, win 1 / push 0.5 / loss 0, no confidence, no upset bonus): %',
      v_pool_name, jsonb_build_object('picks_per_slate', v_pool.settings->'picks_per_slate', 'scoring', v_pool.settings->'scoring',
        'confidence', v_pool.settings->'confidence', 'upset_bonus', v_pool.settings->'upset_bonus');
  end if;

  -- Splash's games, matched to ESPN's final NFL games (both teams and the final score).
  drop table if exists _sg;
  create temp table _sg on commit drop as
  select x.*, null::uuid as game_id, false as swapped
  from jsonb_to_recordset(v_data->'games') x(week int, ord int, away text, home text,
       away_score int, home_score int, home_spread numeric);

  -- Splash's team codes that ESPN spells differently.
  create or replace function pg_temp.espn_abbr(p text) returns text language sql immutable as
    $f$ select case p when 'JAC' then 'JAX' when 'LA' then 'LAR' when 'WAS' then 'WSH' else p end $f$;

  update _sg s set game_id = g.id
  from games g
  join teams h on h.id = g.home_team_id
  join teams a on a.id = g.away_team_id
  where g.sport = 'nfl' and g.season = v_season and g.status = 'final'
    and h.abbreviation = pg_temp.espn_abbr(s.home) and a.abbreviation = pg_temp.espn_abbr(s.away)
    and g.home_score = s.home_score and g.away_score = s.away_score;
  -- A game abroad that ESPN lists the other way round: flip it to ESPN's sides.
  update _sg s set game_id = g.id, swapped = true
  from games g
  join teams h on h.id = g.home_team_id
  join teams a on a.id = g.away_team_id
  where s.game_id is null and g.sport = 'nfl' and g.season = v_season and g.status = 'final'
    and h.abbreviation = pg_temp.espn_abbr(s.away) and a.abbreviation = pg_temp.espn_abbr(s.home)
    and g.home_score = s.away_score and g.away_score = s.home_score;
  select string_agg(format('week %s %s @ %s (%s-%s)', week, away, home, away_score, home_score), '; ')
    into v_bad from _sg where game_id is null;
  if v_bad is not null then
    raise exception 'No final ESPN game matches: %. Run the sync-ranks NFL backfill first, then retry.', v_bad;
  end if;
  if (select count(distinct game_id) from _sg) <> (select count(*) from _sg) then
    raise exception 'Two Splash games matched the same ESPN game';
  end if;
  -- Weeks must not overlap (a matched game in the wrong week would mean a bad match).
  select string_agg(format('week %s', a.week), ', ') into v_bad
  from (select week, max(g.start_at) as last from _sg join games g on g.id = game_id group by week) a
  join (select week, min(g.start_at) as first from _sg join games g on g.id = game_id group by week) b on b.week = a.week + 1
  where a.last >= b.first;
  if v_bad is not null then
    raise exception 'ESPN game dates overlap between weeks: %', v_bad;
  end if;

  -- Never overwrite a week the app made: an existing slate for an imported week may only hold
  -- this import's games for that week.
  select string_agg(format('Week %s (%s)', s.week, s.status), ', ') into v_bad
  from slates s
  where s.pool_id = v_pool.id
    and s.week in (select distinct week from _sg)
    and exists (select 1 from slate_games sg where sg.slate_id = s.id
                and sg.game_id not in (select game_id from _sg x where x.week = s.week));
  if v_bad is not null then
    raise exception 'This pool already has its own % with other games; delete or renumber it first', v_bad;
  end if;

  -- Accounts for the Splash entries (no email is sent: placeholder addresses).
  with e as (
    select * from jsonb_to_recordset(v_data->'entries') r(k int, username text, entry text, name text, email text)
  ), new_users as (
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
           e.email, '', now(), '{{"provider":"email","providers":["email"]}}',
           jsonb_build_object('display_name', e.name, 'splash_username', e.username, 'splash_entry', e.entry),
           now(), now(), '', '', '', ''
    from e
    where not exists (select 1 from auth.users u where lower(u.email) = e.email)
    returning id, email
  )
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text, 'email',
         jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
  from new_users;
  get diagnostics v_n = row_count;
  raise notice 'created % placeholder account(s)', v_n;

  drop table if exists _ent;
  create temp table _ent on commit drop as
  select e.k, e.username, e.entry, e.name, e.email, u.id as user_id
  from jsonb_to_recordset(v_data->'entries') e(k int, username text, entry text, name text, email text)
  join auth.users u on lower(u.email) = e.email;
  if (select count(distinct user_id) from _ent) <> jsonb_array_length(v_data->'entries') then
    raise exception 'Splash entries do not map 1:1 to accounts';
  end if;
  if (select count(*) from _ent e join profiles p on p.id = e.user_id) <> (select count(*) from _ent) then
    raise exception 'Some Splash accounts have no profile';
  end if;

  -- Members, joined before week 1.
  select min(g.start_at) into v_first from _sg join games g on g.id = game_id;
  insert into pool_members (pool_id, user_id, role, joined_at)
  select v_pool.id, e.user_id, 'player', v_first - interval '7 days' from _ent e
  on conflict (pool_id, user_id) do update set joined_at = least(pool_members.joined_at, excluded.joined_at);

  for v_wk in select distinct week from _sg order by week loop
    -- The week runs Tuesday to Tuesday (Central) around its games.
    select (d - ((extract(isodow from d)::int + 5) % 7))::timestamp at time zone 'America/Chicago' into v_win_start
    from (select min((g.start_at at time zone 'America/Chicago')::date) as d
          from _sg join games g on g.id = game_id where week = v_wk) x;

    -- Locked (never open): nobody can pick these weeks in the app.
    insert into slates (pool_id, week, label, window_start, window_end, lock_at, status, published_at)
    values (v_pool.id, v_wk, 'Week ' || v_wk, v_win_start, v_win_start + interval '7 days', null, 'locked', v_win_start)
    on conflict (pool_id, week) do update
      set label = excluded.label, window_start = excluded.window_start, window_end = excluded.window_end,
          lock_at = null, first_day_lock_at = null, status = 'locked', published_at = excluded.published_at
    returning id into v_slate_id;

    delete from picks where slate_id = v_slate_id;
    delete from slate_games where slate_id = v_slate_id;
    insert into slate_games (slate_id, game_id, sort_order, locked_home_spread, locked_line_id, lock_at, voided)
    select v_slate_id, s.game_id, s.ord, case when s.swapped then -s.home_spread else s.home_spread end, null, null, false
    from _sg s where s.week = v_wk;

    insert into picks (slate_id, game_id, user_id, picked_side, confidence)
    select v_slate_id, s.game_id, e.user_id,
           case when s.swapped then (case p.side when 'home' then 'away' else 'home' end) else p.side end, null
    from jsonb_array_elements(v_data->'picks') j
    cross join lateral (select (j->>0)::int as week, (j->>1)::int as ord, (j->>2)::int as k, j->>3 as side) p
    join _sg s on s.week = p.week and s.ord = p.ord
    join _ent e on e.k = p.k
    where p.week = v_wk;
    get diagnostics v_n = row_count;
    select count(*) into v_m from jsonb_array_elements(v_data->'picks') j where (j->>0)::int = v_wk;
    if v_n <> v_m then
      raise exception 'Week %: % of % picks written', v_wk, v_n, v_m;
    end if;

    perform grade_slate(v_slate_id);
    if (select status from slates where id = v_slate_id) <> 'graded' then
      raise exception 'Week % did not grade', v_wk;
    end if;

    -- Every graded pick and every weekly total must be Splash's.
    select count(*) into v_n
    from jsonb_array_elements(v_data->'picks') j
    cross join lateral (select (j->>0)::int as week, (j->>1)::int as ord, (j->>2)::int as k, j->>4 as result) p
    join _sg s on s.week = p.week and s.ord = p.ord
    join _ent e on e.k = p.k
    join picks pk on pk.slate_id = v_slate_id and pk.game_id = s.game_id and pk.user_id = e.user_id
    where p.week = v_wk and pk.result is distinct from p.result;
    if v_n > 0 then
      raise exception 'Week %: % pick result(s) differ from Splash', v_wk, v_n;
    end if;
    select string_agg(format('%s %s: %s vs Splash %s', e.username, e.entry, coalesce(ss.points, 0), p.pts), '; ') into v_bad
    from jsonb_array_elements(v_data->'points') j
    cross join lateral (select (j->>0)::int as week, (j->>1)::int as k, (j->>2)::numeric as pts) p
    join _ent e on e.k = p.k
    left join slate_scores ss on ss.slate_id = v_slate_id and ss.user_id = e.user_id
    where p.week = v_wk and coalesce(ss.points, 0) <> p.pts;
    if v_bad is not null then
      raise exception 'Week % totals differ from Splash: %', v_wk, v_bad;
    end if;
    raise notice 'week %: % games, % picks, graded, matches Splash', v_wk,
      (select count(*) from _sg where week = v_wk), v_m;
  end loop;
end
$import$;
"""
open(out, "w").write(sql)
print(f"{len(ent)} entries, {len(games)} games, {len(picks)} picks -> {out} ({len(sql)//1024} KB)")
