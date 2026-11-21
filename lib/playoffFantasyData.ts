import "server-only";
import { getBenchedIds } from "./bench";
import { getGameSummary } from "./gameSummary";
import type { PoolBase } from "./pool";
import {
  ROUNDS,
  defId,
  defLine,
  defPoints,
  pfSettings,
  playerLines,
  playerPoints,
  type BoxTeam,
  type PfScoring,
  type Position,
} from "./playoffFantasy";

// A Playoff Fantasy pool's data: the playoff teams and player list the commissioner set up,
// the lineups the viewer can see, and everyone's points, worked out from ESPN's box scores for
// each playoff game (nothing is stored but the lineups).

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" };

export type PfTeam = { id: string; espnId: string | null; name: string; abbreviation: string | null; logo_url: string | null };
export type PfPlayer = { id: string; name: string; pos: Position; teamId: string };
export type PfEntry = { userId: string; name: string; playerIds: string[] };

export async function getPf(ctx: PoolBase) {
  const settings = pfSettings(ctx.pool.settings);
  const db = ctx.supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: teamRows }, { data: playerRows }, { data: lineupRows }, { data: memberRows }, benched] = await Promise.all([
    db.from("pf_teams").select("team:teams!inner ( id, espn_id, name, short_name, abbreviation, logo_url )").eq("pool_id", ctx.pool.id),
    db.from("pf_players").select("espn_id, name, pos, team_id").eq("pool_id", ctx.pool.id).order("name").limit(2000),
    // Row security: the viewer's own lineup always, everyone's once lineups lock.
    db.from("pf_lineups").select("user_id, player_ids").eq("pool_id", ctx.pool.id),
    db.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    getBenchedIds(ctx.supabase, ctx.pool.id),
  ]);
  const teams: PfTeam[] = ((teamRows ?? []) as Row[])
    .map((r) => ({ id: r.team.id, espnId: r.team.espn_id, name: r.team.short_name ?? r.team.name, abbreviation: r.team.abbreviation, logo_url: r.team.logo_url }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const players: PfPlayer[] = ((playerRows ?? []) as Row[]).map((p) => ({ id: p.espn_id, name: p.name, pos: p.pos, teamId: p.team_id }));
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

type PlayoffGame = { id: string; round: number; state: "pre" | "in" | "post"; teams: { espnId: string; score: number; lost: boolean }[] };

/** The season's playoff games so far: ESPN's postseason scoreboard, one request per round. */
async function playoffGames(season: number): Promise<PlayoffGame[]> {
  const rounds = await Promise.all(
    ROUNDS.map(async (r, i) => {
      try {
        const res = await fetch(`${ESPN}/scoreboard?seasontype=3&week=${r.week}&dates=${season}`, { headers: HEADERS, next: { revalidate: 120 }, signal: AbortSignal.timeout(5000) });
        if (!res.ok) return [];
        const data = (await res.json()) as Row;
        return ((data?.events ?? []) as Row[]).map((e): PlayoffGame => {
          const comp = e?.competitions?.[0] ?? {};
          const state = comp?.status?.type?.state ?? e?.status?.type?.state;
          const over = state === "post";
          return {
            id: String(e.id),
            round: i,
            state: state === "in" || state === "post" ? state : "pre",
            teams: ((comp.competitors ?? []) as Row[]).map((c) => ({ espnId: String(c?.team?.id ?? ""), score: Number(c?.score ?? 0) || 0, lost: over && c?.winner === false })),
          };
        });
      } catch {
        return [];
      }
    }),
  );
  return rounds.flat();
}

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

/** Everyone's fantasy points so far under this pool's scoring. Never rejects: what can't be read counts as nothing yet. */
export async function getPfPoints(season: number, sc: PfScoring): Promise<PfPoints> {
  const games = (await playoffGames(season).catch(() => [])).filter((g) => g.state !== "pre");
  const byPlayer = new Map<string, { total: number; rounds: number[] }>();
  const add = (id: string, round: number, pts: number) => {
    const p = byPlayer.get(id) ?? { total: 0, rounds: [0, 0, 0, 0] };
    p.rounds[round] = Math.round((p.rounds[round] + pts) * 100) / 100;
    p.total = Math.round((p.total + pts) * 100) / 100;
    byPlayer.set(id, p);
  };
  await Promise.all(
    games.map(async (g) => {
      const sum = await getGameSummary("nfl", g.id, g.state === "in").catch(() => null);
      if (!sum) return;
      const boxes = sum.players as BoxTeam[];
      for (const box of boxes) {
        for (const [id, line] of playerLines(box)) add(id, g.round, playerPoints(line, sc));
        const opponent = boxes.find((b) => b.teamId !== box.teamId);
        // The other side's score, from the summary (live) or the scoreboard.
        const oppSide = sum.home?.id === box.teamId ? sum.away : sum.home;
        const oppScore = Number(oppSide?.score ?? g.teams.find((t) => t.espnId !== box.teamId)?.score ?? 0) || 0;
        add(defId(box.teamId), g.round, defPoints(defLine(box, opponent, oppScore), sc));
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

/** One team's fantasy-relevant players from its ESPN roster (plus the team's defense). Throws if ESPN can't be read. */
export async function espnRoster(team: PfTeam): Promise<{ espn_id: string; name: string; pos: Position }[]> {
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
  return [...out, { espn_id: defId(team.espnId), name: `${team.name} Defense`, pos: "DEF" }];
}
