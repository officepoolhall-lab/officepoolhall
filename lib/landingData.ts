import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { currentRound, espnTournamentId, getLiveLeaderboard } from "./golfLive";
import { fresh } from "./microCache";
import { poolTypeLabel } from "./poolType";
import { createAdminClient } from "./supabase/admin";

// Real data for the landing page's previews, from pools being played right now: this week's
// games, picks, standings and pool summary from a football/basketball pool, and the live
// leaderboard of a golf pool's tournament. Every player's name is replaced with a made-up one.
//
// Only what any member would see is used: other players' picks only on games that have
// started (or a graded week), never picks still hidden before kickoff.
//
// Which pools: LANDING_POOL_SLUG / LANDING_GOLF_SLUG when set; otherwise the in-progress pool
// with the most members (demo pools excluded). Read with the service role (visitors aren't
// signed in), shared for two minutes.

export type PreviewTeam = { name: string; abbr: string; logo: string | null; rank: number | null };
export type PreviewGame = {
  id: string;
  away: PreviewTeam;
  home: PreviewTeam;
  status: "scheduled" | "live" | "final";
  time: string;
  awayScore: number | null;
  homeScore: number | null;
  /** Home team's spread (ATS pools), e.g. -6.5. */
  spread: number | null;
};
export type PreviewPick = { side: "home" | "away"; result: "win" | "loss" | "push" | null; confidence: number | null };

export type LandingData = {
  pool: { type: string; week: string; ats: boolean; confidence: boolean };
  /** One entry's week: their picks on games that have started, and games still to come. */
  myPicks: { picked: number; total: number; games: { game: PreviewGame; pick: PreviewPick | null }[] };
  grid: { games: PreviewGame[]; rows: { name: string; pts: string; cells: (PreviewPick | null)[] }[] };
  standings: { rank: string; name: string; record: string; pts: string; mine: boolean }[];
  summary: { label: string; logo: string | null; pct: number; result: "win" | "loss" | "push" | null }[];
  scores: PreviewGame[];
  golf: {
    event: string;
    round: number | null;
    live: boolean;
    rows: { pos: string; name: string; score: string; thru: string; mine: boolean }[];
  } | null;
};

const FAKE_NAMES = [
  "Megan R.", "Dave K.", "Priya S.", "Tom B.", "Alex M.", "Jordan P.", "Chris L.", "Sam W.", "Taylor G.", "Morgan F.",
  "Jamie D.", "Casey H.", "Riley N.", "Drew C.", "Avery T.", "Quinn J.", "Blake V.", "Reese A.", "Cameron E.", "Hayden O.",
];
const fakeName = (i: number) => FAKE_NAMES[i % FAKE_NAMES.length] + (i >= FAKE_NAMES.length ? ` ${Math.floor(i / FAKE_NAMES.length) + 1}` : "");

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const fmtPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Every row of a query, 1000 at a time (the API's page limit). */
async function allRows(page: (from: number, to: number) => PromiseLike<{ data: Row[] | null }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data } = await page(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function team(t: Row | null): PreviewTeam {
  return { name: t?.short_name || t?.name || "TBD", abbr: t?.abbreviation || (t?.name ?? "").slice(0, 4).toUpperCase(), logo: t?.logo_url ?? null, rank: null };
}

/** The in-progress pool to show: the named one, or the one with the most members. */
async function choosePool(db: ReturnType<typeof createAdminClient>, golf: boolean): Promise<Row | null> {
  const named = golf ? process.env.LANDING_GOLF_SLUG : process.env.LANDING_POOL_SLUG;
  if (named) {
    const { data } = await db.from("pools").select("id, slug, name, sport, settings").eq("slug", named).maybeSingle();
    if (data) return data;
  }
  const { data: pools } = await db
    .from("pools")
    .select("id, slug, name, sport, settings, pool_members ( count )")
    .not("slug", "like", "demo-%");
  const candidates = (pools ?? []).filter((p: Row) => (golf ? p.sport === "pga" : p.sport !== "pga"));
  const live: Row[] = [];
  for (const p of candidates) {
    if (golf) {
      const { count } = await db.from("golf_events").select("id", { count: "exact", head: true }).eq("pool_id", p.id).eq("status", "in_progress");
      if (count) live.push(p);
    } else {
      const { count } = await db.from("slates").select("id", { count: "exact", head: true }).eq("pool_id", p.id).in("status", ["open", "locked"]);
      if (count) live.push(p);
    }
  }
  const members = (p: Row) => (Array.isArray(p.pool_members) ? (p.pool_members[0]?.count ?? 0) : 0);
  return live.sort((a, b) => members(b) - members(a))[0] ?? null;
}

async function teamPoolData(db: ReturnType<typeof createAdminClient>, now: number) {
  const pool = await choosePool(db, false);
  if (!pool) return null;
  const settings = (pool.settings ?? {}) as Row;
  const tz = settings.timezone || "America/Chicago";
  const ats = settings.pick_type === "ats";
  const confidence = !!settings.confidence;

  const { data: slates } = await db.from("slates").select("id, week, label, status").eq("pool_id", pool.id).neq("status", "draft").order("week");
  if (!slates?.length) return null;
  const slate = [...slates].reverse().find((s: Row) => s.status === "open" || s.status === "locked") ?? slates[slates.length - 1];
  const graded = slate.status === "graded";

  const [{ data: sg }, { data: members }, picks, scores] = await Promise.all([
    db
      .from("slate_games")
      .select(
        `game_id, locked_home_spread, voided, override_home_score, override_away_score,
         game:games!inner ( id, start_at, time_tbd, status, home_score, away_score, home_rank, away_rank,
           home:teams!games_home_team_id_fkey ( name, short_name, abbreviation, logo_url ),
           away:teams!games_away_team_id_fkey ( name, short_name, abbreviation, logo_url ) )`,
      )
      .eq("slate_id", slate.id),
    db.from("pool_members").select("user_id").eq("pool_id", pool.id),
    allRows((a, b) => db.from("picks").select("user_id, game_id, picked_side, confidence, result").eq("slate_id", slate.id).order("user_id").order("game_id").range(a, b)),
    allRows((a, b) =>
      db.from("slate_scores").select("slate_id, user_id, points, wins, losses, pushes").in("slate_id", slates.map((s: Row) => s.id)).order("slate_id").order("user_id").range(a, b),
    ),
  ]);

  // Made-up names, in a fixed order so a player keeps the same one across the previews.
  const ids: string[] = (members ?? []).map((m: Row) => m.user_id as string).sort();
  const nameOf = new Map<string, string>(ids.map((id, i) => [id, fakeName(i)]));

  const games: (PreviewGame & { started: boolean })[] = (sg ?? [])
    .filter((x: Row) => !x.voided)
    .map((x: Row) => {
      const g = x.game;
      const status = g.status === "final" ? "final" : g.status === "in_progress" ? "live" : "scheduled";
      const started = status !== "scheduled" || (!g.time_tbd && Date.parse(g.start_at) <= now);
      return {
        id: x.game_id,
        away: { ...team(g.away), rank: g.away_rank ?? null },
        home: { ...team(g.home), rank: g.home_rank ?? null },
        status,
        time: status === "final" ? "Final" : status === "live" ? "Live" : g.time_tbd ? "TBD" : formatInTimeZone(g.start_at, tz, "EEE h:mm a"),
        awayScore: num(x.override_away_score ?? g.away_score),
        homeScore: num(x.override_home_score ?? g.home_score),
        spread: ats ? num(x.locked_home_spread) : null,
        started,
      };
    })
    .sort((a: Row, b: Row) => (a.status === "live" ? 0 : 1) - (b.status === "live" ? 0 : 1));
  const byId = new Map<string, PreviewGame & { started: boolean }>(games.map((g) => [g.id, g]));
  // Only picks a member could see now: on games that have started, or any once the week is graded.
  const visible = (picks ?? []).filter((p: Row) => graded || byId.get(p.game_id)?.started);
  const pickOf = (p: Row): PreviewPick => ({ side: p.picked_side, result: p.result ?? null, confidence: p.confidence ?? null });

  // Season standings from every week's scores.
  const totals = new Map<string, { pts: number; w: number; l: number; p: number }>();
  for (const s of scores ?? []) {
    const t = totals.get(s.user_id) ?? { pts: 0, w: 0, l: 0, p: 0 };
    t.pts += Number(s.points); t.w += s.wins; t.l += s.losses; t.p += s.pushes;
    totals.set(s.user_id, t);
  }
  const ranked = ids
    .map((id) => ({ id, ...(totals.get(id) ?? { pts: 0, w: 0, l: 0, p: 0 }) }))
    .sort((a, b) => b.pts - a.pts || b.w - a.w || nameOf.get(a.id)!.localeCompare(nameOf.get(b.id)!));
  const rankOf = new Map<string, string>();
  ranked.forEach((r, i) => {
    const first = ranked.findIndex((x) => x.pts === r.pts && x.w === r.w);
    const tied = ranked.filter((x) => x.pts === r.pts && x.w === r.w).length > 1;
    rankOf.set(r.id, `${tied ? "T" : ""}${first + 1}`);
    void i;
  });

  // The featured entry for "My Picks": the leader with picks on started games this week.
  const withPicks = new Set(visible.map((p: Row) => p.user_id));
  const me = ranked.find((r) => withPicks.has(r.id)) ?? ranked[0];
  const myVisible = visible.filter((p: Row) => p.user_id === me?.id);
  const myPicked = new Map<string, PreviewPick>(myVisible.map((p: Row) => [p.game_id, pickOf(p)]));
  const startedGames = games.filter((g) => g.started);
  const upcoming = games.filter((g) => !g.started);
  const myGames = [
    ...startedGames.filter((g) => myPicked.has(g.id)).slice(0, 2),
    ...upcoming.slice(0, 1),
  ].map((g) => ({ game: g, pick: myPicked.get(g.id) ?? null }));
  const myCount = (picks ?? []).filter((p: Row) => p.user_id === me?.id).length;

  // Grid: the latest started games with picks, for the week's top players.
  const pickedGameIds = new Set(visible.map((p: Row) => p.game_id));
  const gridGames = startedGames.filter((g) => pickedGameIds.has(g.id)).slice(0, 5);
  const weekPts = new Map<string, number>();
  for (const s of scores ?? []) if (s.slate_id === slate.id) weekPts.set(s.user_id, Number(s.points));
  const cell = new Map<string, PreviewPick>(visible.map((p: Row) => [`${p.user_id}:${p.game_id}`, pickOf(p)]));
  const gridRows = ranked.slice(0, 5).map((r) => ({
    name: nameOf.get(r.id)!,
    pts: fmtPts(weekPts.get(r.id) ?? 0),
    cells: gridGames.map((g) => cell.get(`${r.id}:${g.id}`) ?? null),
  }));

  // Pool summary: the most-picked sides on games that have finished.
  const summary = games
    .filter((g) => g.status === "final")
    .flatMap((g) => {
      const on = visible.filter((p: Row) => p.game_id === g.id);
      if (on.length < 2) return [];
      const home = on.filter((p: Row) => p.picked_side === "home").length;
      const side: "home" | "away" = home * 2 >= on.length ? "home" : "away";
      const t = side === "home" ? g.home : g.away;
      const s = g.spread === null ? null : side === "home" ? g.spread : -g.spread;
      const result = (on.find((p: Row) => p.picked_side === side)?.result ?? null) as "win" | "loss" | "push" | null;
      return [{
        label: `${t.abbr}${s === null ? "" : ` ${s > 0 ? "+" : s < 0 ? "−" : ""}${s === 0 ? "PK" : Math.abs(s)}`}`,
        logo: t.logo,
        pct: Math.round((100 * (side === "home" ? home : on.length - home)) / on.length),
        result,
      }];
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  return {
    pool: { type: poolTypeLabel(pool as { sport: string; settings: unknown }), week: slate.label || `Week ${slate.week}`, ats, confidence },
    myPicks: { picked: myCount, total: Number(settings.picks_per_slate) || myCount, games: myGames },
    grid: { games: gridGames, rows: gridRows },
    standings: ranked.slice(0, 5).map((r) => ({
      rank: rankOf.get(r.id)!,
      name: nameOf.get(r.id)!,
      record: `${r.w}-${r.l}${r.p ? `-${r.p}` : ""}`,
      pts: fmtPts(r.pts),
      mine: r.id === me?.id,
    })),
    summary,
    // Scores: live games first, then the latest finals, then what's next.
    scores: [
      ...games.filter((g) => g.status === "live"),
      ...games.filter((g) => g.status === "final"),
      ...upcoming,
    ].slice(0, 4),
  };
}

async function golfData(db: ReturnType<typeof createAdminClient>): Promise<LandingData["golf"]> {
  const pool = await choosePool(db, true);
  if (!pool) return null;
  const { data: ev } = await db.from("golf_events").select("id, espn_id, name, status").eq("pool_id", pool.id).eq("status", "in_progress").order("sort_order").limit(1).maybeSingle();
  if (!ev) return null;
  const tid = espnTournamentId(ev.espn_id, pool.slug, ev.status);
  if (!tid) return null;
  const board = await getLiveLeaderboard(tid, 0).catch(() => null);
  if (!board?.length) return null;
  // One entry's golfers, marked as theirs.
  const { data: lineups } = await db.from("golf_lineups").select("user_id, espn_golfer_id").eq("event_id", ev.id).limit(2000);
  const owners = [...new Set((lineups ?? []).map((l: Row) => l.user_id as string))].sort();
  const mine = new Set((lineups ?? []).filter((l: Row) => l.user_id === owners[0]).map((l: Row) => l.espn_golfer_id as string));
  const rows = board
    .filter((g) => !g.out && g.pos && g.pos !== "-")
    .slice(0, 6)
    .map((g) => ({
      pos: g.pos,
      name: g.name,
      score: g.toPar ? g.toPar.replace(/^-/, "−") : "E",
      thru: g.thru ?? (g.tee ? formatInTimeZone(g.tee, "America/Chicago", "h:mm a") : "–"),
      mine: mine.has(g.id),
    }));
  return { event: ev.name, round: await currentRound(tid, board), live: true, rows };
}

/** The landing page's previews, or null when nothing is being played (the page falls back to examples). */
export async function getLandingData(): Promise<LandingData | null> {
  return fresh("landing-data", 120_000, async () => {
    try {
      const db = createAdminClient();
      const now = Date.now();
      const [team, golf] = await Promise.all([teamPoolData(db, now).catch(() => null), golfData(db).catch(() => null)]);
      if (!team) return null;
      return { ...team, golf };
    } catch {
      return null;
    }
  });
}
