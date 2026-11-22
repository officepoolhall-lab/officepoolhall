import "server-only";
import { getBenchedIds } from "./bench";
import { hasStarted } from "./locks";
import { espnDate, fetchLiveDetails, orientLive } from "./liveClock";
import { getTeamRecords } from "./teamRecords";
import { getPublishedSlates, type PoolBase } from "./pool";
import { applyDemoNow, applyDemoResults, demoLive, survivorSettings, type SvGame, type SvMember, type SvPick, type SvSplit, type SvWeek } from "./survivor";

// A Survivor pool's season in one load: its published weeks with their games, the picks the
// viewer can see (their own always; everyone's once each game kicks off) and the entries.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TEAM = "id, espn_id, name, short_name, abbreviation, logo_url";

/**
 * `revealFor`: the entry the commissioner is picking for. The commissioner can read every pick
 * (to make or fix one), but the pages only show them another entry's pick before kickoff when
 * they've opened that entry on purpose, the same as any player sees.
 */
export async function getSurvivor(ctx: PoolBase, revealFor?: string) {
  const settings = survivorSettings(ctx.pool.settings);
  const slates = (await getPublishedSlates(ctx)) as Row[];
  const ids = slates.map((s) => s.id as string);
  const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: gameRows }, { data: pickRows }, { data: memberRows }, benched, { data: reqRows }, { data: splitRows }] = await Promise.all([
    ids.length
      ? db
          .from("slate_games")
          .select(
            `slate_id, voided, override_home_score, override_away_score,
             game:games!inner ( id, espn_id, start_at, time_tbd, status, home_score, away_score, tv_network,
               home:teams!games_home_team_id_fkey ( ${TEAM} ), away:teams!games_away_team_id_fkey ( ${TEAM} ) )`,
          )
          .in("slate_id", ids)
      : Promise.resolve({ data: [] }),
    db.from("survivor_picks").select("slate_id, user_id, game_id, team_id").eq("pool_id", ctx.pool.id),
    db.from("pool_members").select("user_id, joined_at, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    getBenchedIds(ctx.supabase, ctx.pool.id),
    // Split requests and an agreed split (migration 067; empty before it's run).
    db.from("survivor_split_requests").select("user_id, slate_id").eq("pool_id", ctx.pool.id),
    db.from("survivor_splits").select("user_ids, week").eq("pool_id", ctx.pool.id),
  ]);
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games have started
  const now = Date.now();
  const bySlate = new Map<string, SvGame[]>();
  for (const r of (gameRows ?? []) as Row[]) {
    const g = r.game;
    const game: SvGame = {
      id: g.id,
      startAt: g.start_at,
      started: hasStarted({ startAt: g.start_at, timeTbd: g.time_tbd, status: g.status }, now),
      final: g.status === "final",
      voided: r.voided,
      homeScore: r.override_home_score ?? g.home_score,
      awayScore: r.override_away_score ?? g.away_score,
      home: g.home,
      away: g.away,
      espnId: g.espn_id,
      tv: g.tv_network,
      timeTbd: g.time_tbd,
      clock: null,
    };
    bySlate.set(r.slate_id, [...(bySlate.get(r.slate_id) ?? []), game]);
  }
  const stored: SvWeek[] = slates
    .map((s) => ({
      slateId: s.id as string,
      week: s.week as number,
      label: (s.label as string | null) ?? `Week ${s.week}`,
      games: (bySlate.get(s.id) ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.week - b.week);
  // A demo pool shown as if one week were being played now (lib/survivor.ts → demoLive).
  const withDemo = applyDemoResults(applyDemoNow(stored, settings.demo_now), settings.demo_results);
  const weeks = settings.demo_live_week ? demoLive(withDemo, settings.demo_live_week) : withDemo;
  const started = new Set(weeks.flatMap((w) => w.games).filter((g) => g.started).map((g) => g.id));
  const picks: SvPick[] = ((pickRows ?? []) as Row[])
    .map((p) => ({ slateId: p.slate_id, userId: p.user_id, gameId: p.game_id, teamId: p.team_id }))
    .filter((p) => p.userId === ctx.entryUserId || p.userId === revealFor || started.has(p.gameId));
  const members: SvMember[] = ((memberRows ?? []) as Row[])
    .filter((m) => !benched.has(m.user_id))
    .map((m) => ({ userId: m.user_id, name: m.profile.display_name, joinedAt: m.joined_at }));
  // Who has asked to split, and for which week (requests don't carry over).
  const splitRequests = new Map(((reqRows ?? []) as Row[]).map((r) => [r.user_id as string, r.slate_id as string | null]));
  const s0 = ((splitRows ?? []) as Row[])[0];
  const split: SvSplit | null = s0 ? { userIds: s0.user_ids as string[], week: (s0.week as number | null) ?? null } : null;
  // Once the pot is split the pool is over: nothing after that week, and no picks in it.
  if (split?.week != null) {
    const cut = split.week;
    const weekOf = new Map(weeks.map((w) => [w.slateId, w.week]));
    return {
      settings,
      weeks: weeks.filter((w) => w.week <= cut),
      picks: picks.filter((p) => (weekOf.get(p.slateId) ?? 0) < cut),
      members,
      splitRequests,
      split,
    };
  }
  return { settings, weeks, picks, members, splitRequests, split };
}

/**
 * Games in progress with ESPN's latest score and clock laid over the stored ones (the stored
 * score trails by up to a minute). Anything ESPN can't answer keeps what's stored.
 */
export async function withLiveScores(weeks: SvWeek[]): Promise<SvWeek[]> {
  const live = weeks.flatMap((w) => w.games).filter((g) => g.started && !g.final && !g.voided && g.espnId && !g.espnId.startsWith("demo-"));
  if (!live.length) return weeks;
  const found = await fetchLiveDetails("nfl", live.map((g) => espnDate(g.startAt)));
  return weeks.map((w) => ({
    ...w,
    games: w.games.map((g) => {
      const raw = g.espnId && g.started && !g.final && !g.clock ? found.get(g.espnId) : undefined;
      if (!raw) return g;
      const f = orientLive(raw, g.home.espn_id);
      return { ...g, clock: f.clock, homeScore: f.home ?? g.homeScore, awayScore: f.away ?? g.awayScore };
    }),
  }));
}

/** Any game under way: the pages refresh themselves while this is true. */
export const anyLive = (weeks: SvWeek[]) => weeks.some((w) => w.games.some((g) => g.started && !g.final && !g.voided));

/**
 * What My Pick shows beside each team: the current point spread (home team's, from the pool's
 * sportsbook, else any) and every team's record (ESPN team id → "7-3").
 */
export async function getWeekExtras(ctx: PoolBase, week: SvWeek) {
  const ids = week.games.map((g) => g.id);
  const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const book = (ctx.pool.settings as { lines?: { bookmaker?: string } } | null)?.lines?.bookmaker;
  const [{ data: lines }, records] = await Promise.all([
    ids.length
      ? db.from("latest_game_lines").select("game_id, bookmaker, home_spread").in("game_id", ids).not("home_spread", "is", null)
      : Promise.resolve({ data: [] }),
    getTeamRecords("nfl", week.games.map((g) => g.startAt)),
  ]);
  const spreads = new Map<string, number>();
  for (const l of (lines ?? []) as Row[]) {
    if (!spreads.has(l.game_id) || l.bookmaker === book) spreads.set(l.game_id, Number(l.home_spread));
  }
  return { spreads, records };
}
