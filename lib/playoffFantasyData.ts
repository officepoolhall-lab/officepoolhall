import "server-only";
import { getBenchedIds } from "./bench";
import { getGameSummary } from "./gameSummary";
import type { PoolBase } from "./pool";
import { fresh } from "./microCache";
import { getPlayoffField, getPlayoffGames, getProjectedField } from "./nflPlayoffs";
import {
  applyExtras,
  defId,
  defLine,
  defPoints,
  nameKey,
  pfSettings,
  playerLines,
  playerPoints,
  scoringExtras,
  type BoxTeam,
  type PfScoring,
  type Position,
} from "./playoffFantasy";
import { createAdminClient } from "./supabase/admin";

// A Playoff Fantasy pool's data: the playoff teams and player list the commissioner set up,
// the lineups the viewer can see, and everyone's points, worked out from ESPN's box scores for
// each playoff game (nothing is stored but the lineups).

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" };

export type PfTeam = { id: string; espnId: string | null; name: string; abbreviation: string | null; logo_url: string | null };
export type PfPlayer = { id: string; name: string; pos: Position; teamId: string; /** 1 = the starter at his position (ESPN's depth chart); null if unlisted. */ depth?: number | null };
export type PfEntry = { userId: string; name: string; playerIds: string[] };

/**
 * The pool's setup and lineups. The first time it's read after the playoff field is set, the
 * 14 teams and their players load by themselves (and rosters lock at the first Wild Card
 * kickoff unless the commissioner chose another time).
 */
export async function getPf(ctx: PoolBase): Promise<Awaited<ReturnType<typeof readPf>>> {
  const first = await readPf(ctx);
  if (first.players.length > 0 || first.teams.length > 0 || first.locked) return first;
  // Nothing set up yet: see whether the field is known. One attempt a minute, shared by every visitor.
  const loaded = await fresh(`pf-setup:${ctx.pool.id}`, 60_000, () => setupFromEspn(ctx.pool).then((r) => r.ok)).catch(() => false);
  if (!loaded) return first;
  const settings = (await createAdminClient().from("pools").select("settings").eq("id", ctx.pool.id).maybeSingle()).data?.settings;
  return readPf({ ...ctx, pool: { ...ctx.pool, settings: settings ?? ctx.pool.settings } } as PoolBase);
}

async function readPf(ctx: PoolBase) {
  const settings = pfSettings(ctx.pool.settings);
  const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: teamRows }, { data: playerRows }, { data: lineupRows }, { data: memberRows }, benched] = await Promise.all([
    db.from("pf_teams").select("team:teams!inner ( id, espn_id, name, short_name, abbreviation, logo_url )").eq("pool_id", ctx.pool.id),
    db.from("pf_players").select("*").eq("pool_id", ctx.pool.id).order("name").limit(2000),
    // Row security: the viewer's own lineup always, everyone's once lineups lock.
    db.from("pf_lineups").select("user_id, player_ids").eq("pool_id", ctx.pool.id),
    db.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    getBenchedIds(ctx.supabase, ctx.pool.id),
  ]);
  const teams: PfTeam[] = ((teamRows ?? []) as Row[])
    .map((r) => ({ id: r.team.id, espnId: r.team.espn_id, name: r.team.short_name ?? r.team.name, abbreviation: r.team.abbreviation, logo_url: r.team.logo_url }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const players: PfPlayer[] = ((playerRows ?? []) as Row[]).map((p) => ({ id: p.espn_id, name: p.name, pos: p.pos, teamId: p.team_id, depth: p.depth ?? null }));
  const lineupOf = new Map<string, string[]>(((lineupRows ?? []) as Row[]).map((l) => [l.user_id, l.player_ids ?? []]));
  const entries: PfEntry[] = ((memberRows ?? []) as Row[])
    .filter((m) => !benched.has(m.user_id))
    .map((m) => ({ userId: m.user_id, name: m.profile.display_name, playerIds: lineupOf.get(m.user_id) ?? [] }));
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of the lock
  const locked = settings.lock_at ? Date.parse(settings.lock_at) <= Date.now() : false;
  return { settings, teams, players, entries, locked };
}

// ---------------------------------------------------------------------------------------------
// Points, from ESPN
// ---------------------------------------------------------------------------------------------

export type PfPoints = {
  /** Per player id (a defense is "DEF-<team ESPN id>"): points by round (WC, DIV, CONF, SB) and in all. */
  byPlayer: Map<string, { total: number; rounds: number[] }>;
  /** ESPN ids of teams knocked out. */
  out: Set<string>;
  /** A playoff game is being played right now. */
  live: boolean;
  /** Rounds that have started (how many of the four columns to show). */
  roundsStarted: number;
};

export const NO_POINTS: PfPoints = { byPlayer: new Map(), out: new Set(), live: false, roundsStarted: 0 };

/**
 * Everyone's fantasy points so far under this pool's scoring: each playoff game's box score,
 * plus its scoring summary for what the box score leaves out (field goal distances, two-point
 * conversions, safeties). `players` and `teams` are the pool's list, for matching the names in
 * the scoring summary. Never rejects: what can't be read counts as nothing yet.
 */
export async function getPfPoints(season: number, sc: PfScoring, players: PfPlayer[] = [], teams: PfTeam[] = []): Promise<PfPoints> {
  const games = (await getPlayoffGames(season).catch(() => [])).filter((g) => g.state !== "pre");
  const byPlayer = new Map<string, { total: number; rounds: number[] }>();
  const add = (id: string, round: number, pts: number) => {
    const p = byPlayer.get(id) ?? { total: 0, rounds: [0, 0, 0, 0] };
    p.rounds[round] = Math.round((p.rounds[round] + pts) * 100) / 100;
    p.total = Math.round((p.total + pts) * 100) / 100;
    byPlayer.set(id, p);
  };
  // Full name → player id, per team (ESPN id), from the pool's list.
  const espnOf = new Map(teams.map((t) => [t.id, t.espnId ?? ""]));
  const names = new Map<string, Map<string, string>>();
  for (const p of players) {
    const team = espnOf.get(p.teamId) ?? "";
    if (!names.has(team)) names.set(team, new Map());
    names.get(team)!.set(nameKey(p.name), p.id);
  }
  await Promise.all(
    games.map(async (g) => {
      const sum = await getGameSummary("nfl", g.id, g.state === "in").catch(() => null);
      if (!sum) return;
      const boxes = sum.players as BoxTeam[];
      const extras = scoringExtras(sum.scoring ?? []);
      for (const box of boxes) {
        const lines = playerLines(box);
        applyExtras(box, lines, extras, (name) => names.get(box.teamId)?.get(nameKey(name)));
        for (const [id, line] of lines) add(id, g.round, playerPoints(line, sc));
        const opponent = boxes.find((b) => b.teamId !== box.teamId);
        // The other side's score, from the summary (live) or the scoreboard.
        const oppSide = sum.home?.id === box.teamId ? sum.away : sum.home;
        const oppScore = Number(oppSide?.score ?? g.teams.find((t) => t.espnId !== box.teamId)?.score ?? 0) || 0;
        const safeties = extras.safeties.filter((t) => t === box.teamId).length;
        add(defId(box.teamId), g.round, defPoints(defLine(box, opponent, oppScore, safeties), sc));
      }
    }),
  );
  return {
    byPlayer,
    out: new Set(games.flatMap((g) => g.teams.filter((t) => t.lost).map((t) => t.espnId))),
    live: games.some((g) => g.state === "in"),
    roundsStarted: games.length ? Math.max(...games.map((g) => g.round)) + 1 : 0,
  };
}

export type PfRow = PfEntry & { points: number; rounds: number[]; alive: number; rank: number };

/** Standings: each entry's total, by round, and how many of its players are still playing. */
export function pfStandings(entries: PfEntry[], players: PfPlayer[], teams: PfTeam[], pts: PfPoints): PfRow[] {
  const playerOf = new Map(players.map((p) => [p.id, p]));
  const espnOf = new Map(teams.map((t) => [t.id, t.espnId]));
  const rows = entries.map((e) => {
    const rounds = [0, 0, 0, 0];
    let alive = 0;
    for (const id of e.playerIds) {
      const p = pts.byPlayer.get(id);
      if (p) p.rounds.forEach((v, i) => (rounds[i] += v));
      const team = playerOf.get(id)?.teamId;
      if (team && !pts.out.has(espnOf.get(team) ?? "")) alive++;
    }
    const clean = rounds.map((v) => Math.round(v * 100) / 100);
    return { ...e, rounds: clean, points: Math.round(clean.reduce((a, b) => a + b, 0) * 100) / 100, alive, rank: 0 };
  });
  rows.sort((a, b) => b.points - a.points || b.alive - a.alive || a.name.localeCompare(b.name));
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].points === r.points ? rows[i - 1].rank : i + 1;
  });
  return rows;
}

// ---------------------------------------------------------------------------------------------
// The player list, from ESPN's rosters
// ---------------------------------------------------------------------------------------------

const POS: Record<string, Position> = { QB: "QB", RB: "RB", FB: "RB", WR: "WR", TE: "TE", K: "K", PK: "K" };

const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";
const athleteId = (ref: unknown) => (typeof ref === "string" ? (ref.match(/athletes\/(\d+)/)?.[1] ?? null) : null);

/**
 * How high each player sits on his team's ESPN depth chart (lower is higher): the starter at a
 * position is 1. WR1/WR2/WR3 slots count in order, so the three starting receivers come first.
 * Falls back to the team's statistical leaders (yards) when there's no depth chart. Never
 * rejects: an empty map when ESPN can't be read.
 */
async function espnDepth(espnId: string, season: number): Promise<Map<string, number>> {
  const best = new Map<string, number>();
  const put = (id: string | null, key: number) => {
    if (id && key < (best.get(id) ?? Infinity)) best.set(id, key);
  };
  try {
    const res = await fetch(`${CORE}/seasons/${season}/teams/${encodeURIComponent(espnId)}/depthcharts?limit=50`, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as Row;
      for (const item of (data?.items ?? []) as Row[]) {
        for (const [key, slot] of Object.entries((item?.positions ?? {}) as Record<string, Row>)) {
          const m = key.toLowerCase().match(/^(qb|rb|hb|fb|wr|te|pk|k)(\d?)$/);
          if (!m) continue;
          const n = Number(m[2] || 1);
          for (const a of (slot?.athletes ?? []) as Row[]) {
            const rank = Number(a?.rank ?? a?.slot ?? 99) || 99;
            // WR1 rank 1, WR2 rank 1, WR3 rank 1, then WR1 rank 2, ...
            put(athleteId(a?.athlete?.$ref ?? a?.athlete?.id), (rank - 1) * 3 + n);
          }
        }
      }
    }
  } catch {
    // Try the leaders.
  }
  if (best.size) return best;
  try {
    const res = await fetch(`${CORE}/seasons/${season}/types/2/teams/${encodeURIComponent(espnId)}/leaders`, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as Row;
      for (const c of (data?.categories ?? []) as Row[]) {
        if (!/^(passingYards|rushingYards|receivingYards|totalPoints|fieldGoalsMade)$/.test(String(c?.name ?? ""))) continue;
        ((c?.leaders ?? []) as Row[]).forEach((l, i) => put(athleteId(l?.athlete?.$ref), i + 1));
      }
    }
  } catch {
    // No ranks: everyone unlisted.
  }
  return best;
}

/** One team's fantasy-relevant players from its ESPN roster (plus the team's defense), each with his depth at his position. Throws if ESPN can't be read. */
export async function espnRoster(team: PfTeam, season?: number): Promise<{ espn_id: string; name: string; pos: Position; depth: number | null }[]> {
  if (!team.espnId) throw new Error(`${team.name} has no ESPN id`);
  const res = await fetch(`${ESPN}/teams/${encodeURIComponent(team.espnId)}/roster`, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${team.name}`);
  const data = (await res.json()) as Row;
  // Grouped by unit ({ position: "offense", items: [...] }); older responses are a flat list.
  const groups = (data?.athletes ?? []) as Row[];
  const items: Row[] = groups.some((g) => Array.isArray(g?.items)) ? groups.flatMap((g) => (g?.items ?? []) as Row[]) : groups;
  const out = items
    .map((a) => ({ espn_id: String(a?.id ?? ""), name: String(a?.fullName ?? a?.displayName ?? "").trim(), pos: POS[String(a?.position?.abbreviation ?? "").toUpperCase()] }))
    .filter((p): p is { espn_id: string; name: string; pos: Position } => Boolean(p.espn_id && p.name && p.pos));
  if (!out.length) throw new Error(`ESPN returned no players for ${team.name}`);
  // Depth: order each position by the depth chart, 1, 2, 3...; players it doesn't list get none.
  const ranks = season ? await espnDepth(team.espnId, season) : new Map<string, number>();
  const depth = new Map<string, number>();
  for (const pos of new Set(out.map((p) => p.pos))) {
    out
      .filter((p) => p.pos === pos && ranks.has(p.espn_id))
      .sort((a, b) => ranks.get(a.espn_id)! - ranks.get(b.espn_id)!)
      .forEach((p, i) => depth.set(p.espn_id, i + 1));
  }
  return [...out.map((p) => ({ ...p, depth: depth.get(p.espn_id) ?? null })), { espn_id: defId(team.espnId), name: `${team.name} Defense`, pos: "DEF", depth: 1 }];
}

/**
 * Set a pool up from ESPN with the service role (callers have already checked who's asking):
 * the playoff field as the pool's teams (unless `keepTeams`: the commissioner chose them by
 * hand), every team's players, and the lock time at the first Wild Card kickoff when none is
 * set. Players already on rosters keep their ids; ones who left a roster stay if someone has them.
 */
export async function setupFromEspn(pool: { id: string; season: number; settings: unknown }, keepTeams = false): Promise<{ ok: boolean; message: string }> {
  const db = createAdminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const settings = pfSettings(pool.settings);
  let firstKickoff: string | null = null;

  if (!keepTeams) {
    // A demo pool uses the teams in if the season ended today until the real field is set.
    const field = (await getPlayoffField(pool.season)) ?? (settings.demo_projected ? await getProjectedField(pool.season) : null);
    if (!field) return { ok: false, message: "The playoff field isn't set yet. It loads by itself once the regular season ends." };
    firstKickoff = field.firstKickoff;
    // Make sure every playoff team is in the site's team list, then make them this pool's teams.
    const ids = field.teams.map((t) => t.espnId);
    const { data: have } = await db.from("teams").select("id, espn_id").eq("sport", "nfl").in("espn_id", ids);
    const known = new Map<string, string>(((have ?? []) as Row[]).map((t) => [t.espn_id, t.id]));
    const missing = field.teams.filter((t) => !known.has(t.espnId));
    if (missing.length) {
      const { data: added, error } = await db
        .from("teams")
        .insert(missing.map((t) => ({ sport: "nfl", name: t.fullName || t.name, short_name: t.name, abbreviation: t.abbreviation, espn_id: t.espnId, logo_url: t.logo })))
        .select("id, espn_id");
      if (error) return { ok: false, message: error.message };
      for (const t of (added ?? []) as Row[]) known.set(t.espn_id, t.id);
    }
    await db.from("pf_teams").delete().eq("pool_id", pool.id);
    const { error } = await db.from("pf_teams").insert([...known.values()].map((team_id) => ({ pool_id: pool.id, team_id })));
    if (error) return { ok: false, message: error.message };
  }

  const { data: teamRows } = await db.from("pf_teams").select("team:teams!inner ( id, espn_id, name, short_name, abbreviation, logo_url )").eq("pool_id", pool.id);
  const teams: PfTeam[] = ((teamRows ?? []) as Row[]).map((r) => ({ id: r.team.id, espnId: r.team.espn_id, name: r.team.short_name ?? r.team.name, abbreviation: r.team.abbreviation, logo_url: r.team.logo_url }));
  if (!teams.length) return { ok: false, message: "No playoff teams are set." };

  const results = await Promise.allSettled(teams.map((t) => espnRoster(t, pool.season).then((players) => ({ t, players }))));
  const failed = results.flatMap((r, i) => (r.status === "rejected" ? [teams[i].name] : []));
  const rows = results.flatMap((r) => (r.status === "fulfilled" ? r.value.players.map((p) => ({ pool_id: pool.id, espn_id: p.espn_id, name: p.name, pos: p.pos, team_id: r.value.t.id, depth: p.depth })) : []));
  if (!rows.length) return { ok: false, message: "ESPN's rosters couldn't be read right now. Try again in a minute." };
  let { error } = await db.from("pf_players").upsert(rows);
  // Before migration 069 there's no depth column: save without it.
  if (error && /depth/i.test(error.message)) ({ error } = await db.from("pf_players").upsert(rows.map(({ depth: _d, ...r }) => r))); // eslint-disable-line @typescript-eslint/no-unused-vars
  if (error) return { ok: false, message: error.message };

  // Players no longer on a loaded team's roster (or on a team no longer in the pool) come off
  // the list, unless someone has them.
  const loaded = new Set(results.flatMap((r) => (r.status === "fulfilled" ? [r.value.t.id] : [])));
  const teamIds = new Set(teams.map((t) => t.id));
  const keep = new Set(rows.map((r) => r.espn_id));
  const [{ data: existing }, { data: lineups }] = await Promise.all([
    db.from("pf_players").select("espn_id, team_id").eq("pool_id", pool.id).limit(3000),
    db.from("pf_lineups").select("player_ids").eq("pool_id", pool.id),
  ]);
  const rostered = new Set(((lineups ?? []) as Row[]).flatMap((l) => (l.player_ids ?? []) as string[]));
  const gone = ((existing ?? []) as Row[])
    .filter((p) => !rostered.has(p.espn_id) && (!teamIds.has(p.team_id) || (loaded.has(p.team_id) && !keep.has(p.espn_id))))
    .map((p) => p.espn_id as string);
  if (gone.length) await db.from("pf_players").delete().eq("pool_id", pool.id).in("espn_id", gone);

  // Rosters lock at the first Wild Card kickoff unless the commissioner set a time.
  if (!settings.lock_at && firstKickoff) {
    const all = (pool.settings ?? {}) as Row;
    await db.from("pools").update({ settings: { ...all, playoff_fantasy: { ...(all.playoff_fantasy ?? {}), lock_at: firstKickoff } } }).eq("id", pool.id);
  }
  return failed.length
    ? { ok: true, message: `Loaded ${rows.length} players, but ESPN didn't answer for ${failed.join(", ")}. Reload to pick them up.` }
    : { ok: true, message: `Loaded ${rows.length} players from ${teams.length} teams.` };
}
