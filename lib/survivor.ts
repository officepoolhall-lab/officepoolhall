// NFL Survivor: one team to win each week, each team only once, and an entry is out once it
// has lost all its lives. The rules live in pools.settings.survivor (settings.format =
// "survivor"); the weeks are the pool's slates. A pick's result is read from its game, and the
// database works out lives the same way (survivor_losses, …_survivor_squares_playoff_fantasy.sql).

import { block, int } from "./formats";

export type SurvivorSettings = {
  /** Losses an entry can take before it's out: 1 (classic), 2 or 3. */
  lives: number;
  /** A tied game: a loss (the usual rule) or a win. */
  tie: "loss" | "win";
  /** Off (the usual rule): each team can be picked only once all season. */
  reuse: boolean;
  /** The first of the pool's weeks that counts. */
  start_week: number;
};

export const SURVIVOR_DEFAULT: SurvivorSettings = { lives: 1, tie: "loss", reuse: false, start_week: 1 };

export function survivorSettings(settings: unknown): SurvivorSettings {
  const s = block(settings, "survivor");
  return {
    lives: int(s.lives, 1, 3) ?? 1,
    tie: s.tie === "win" ? "win" : "loss",
    reuse: s.reuse === true,
    start_week: int(s.start_week, 1, 30) ?? 1,
  };
}

export function survivorSettingsError(s: SurvivorSettings): string | null {
  if (s.lives < 1 || s.lives > 3) return "Lives have to be 1, 2 or 3.";
  if (s.start_week < 1 || s.start_week > 30) return "The starting week has to be between 1 and 30.";
  return null;
}

/** The rules in plain words, for Home and the settings summary. */
export function survivorRules(s: SurvivorSettings): string[] {
  return [
    "Pick one team to win each week, straight up.",
    s.reuse ? "You can pick the same team more than once." : "Each team can be picked only once all season.",
    s.lives === 1 ? "One loss and you're out." : `You're out after ${s.lives} losses.`,
    s.tie === "loss" ? "A tie counts as a loss." : "A tie counts as a win.",
    "A week with no pick counts as a loss. Your pick locks when its game kicks off.",
    ...(s.start_week > 1 ? [`The pool starts in Week ${s.start_week}.`] : []),
  ];
}

export type SvTeam = { id: string; name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null; espn_id?: string | null };
export type SvGame = {
  id: string;
  startAt: string;
  started: boolean;
  final: boolean;
  voided: boolean;
  homeScore: number | null;
  awayScore: number | null;
  home: SvTeam;
  away: SvTeam;
  /** For the pages: ESPN's game id (live scores, the box score) and where to watch. */
  espnId?: string | null;
  tv?: string | null;
  timeTbd?: boolean;
  /** A game in progress: ESPN's clock and period ("8:44 2nd"), with the scores above live too. */
  clock?: string | null;
};
export type SvWeek = { slateId: string; week: number; label: string; games: SvGame[] };
export type SvPick = { slateId: string; userId: string; gameId: string; teamId: string };
export type SvMember = { userId: string; name: string; joinedAt: string };

/** won, lost, still to be decided, or doesn't count (its game was voided). */
export type SvResult = "win" | "loss" | "pending" | "void";

export function pickResult(g: SvGame | undefined, teamId: string, tie: SurvivorSettings["tie"]): SvResult {
  if (!g || g.voided) return "void";
  if (!g.final || g.homeScore === null || g.awayScore === null) return "pending";
  const diff = teamId === g.home.id ? g.homeScore - g.awayScore : g.awayScore - g.homeScore;
  if (diff === 0) return tie === "win" ? "win" : "loss";
  return diff > 0 ? "win" : "loss";
}

/** Every game of the week is under way (or over): nobody can still pick. */
export const weekClosed = (w: SvWeek) => {
  const live = w.games.filter((g) => !g.voided);
  return live.length > 0 && live.every((g) => g.started);
};

export type SvCell = {
  week: number;
  slateId: string;
  team: SvTeam | null;
  /** The picked game, for its score and box score. */
  gameId?: string;
  /**
   * win/loss/pending/void: a pick. missed: the week closed with no pick (a loss). open: no pick
   * showing yet (the week is still open; other players' picks show at kickoff). out: already
   * eliminated. before: the week closed before this entry joined.
   */
  state: SvResult | "missed" | "open" | "out" | "before";
};
export type SvRow = {
  userId: string;
  name: string;
  cells: SvCell[];
  losses: number;
  livesLeft: number;
  alive: boolean;
  /** The week the last life went. */
  outWeek: number | null;
  /** Teams already used (team id → week), for the "each team once" rule. */
  used: Map<string, number>;
  rank: number;
};

/** Every entry's season: a cell per counted week, lives left, and who's still alive. */
export function survivorStandings(weeks: SvWeek[], picks: SvPick[], members: SvMember[], s: SurvivorSettings): SvRow[] {
  const counted = weeks.filter((w) => w.week >= s.start_week).sort((a, b) => a.week - b.week);
  const pickOf = new Map(picks.map((p) => [`${p.slateId}:${p.userId}`, p]));
  const rows = members.map((m): SvRow => {
    let losses = 0;
    let outWeek: number | null = null;
    const used = new Map<string, number>();
    const cells = counted.map((w): SvCell => {
      const base = { week: w.week, slateId: w.slateId };
      if (outWeek !== null) return { ...base, team: null, state: "out" };
      const p = pickOf.get(`${w.slateId}:${m.userId}`);
      const live = w.games.filter((g) => !g.voided);
      const lastStart = live.map((g) => g.startAt).sort().pop() ?? null;
      if (!p) {
        if (!weekClosed(w)) return { ...base, team: null, state: "open" };
        if (lastStart && m.joinedAt > lastStart) return { ...base, team: null, state: "before" };
        losses++;
        if (losses >= s.lives) outWeek = w.week;
        return { ...base, team: null, state: "missed" };
      }
      const g = w.games.find((x) => x.id === p.gameId);
      const team = g ? (p.teamId === g.home.id ? g.home : g.away) : null;
      const state = pickResult(g, p.teamId, s.tie);
      if (state !== "void") used.set(p.teamId, w.week);
      if (state === "loss") {
        losses++;
        if (losses >= s.lives) outWeek = w.week;
      }
      return { ...base, team, gameId: p.gameId, state };
    });
    return { userId: m.userId, name: m.name, cells, losses, livesLeft: Math.max(0, s.lives - losses), alive: outWeek === null, outWeek, used, rank: 0 };
  });
  // Alive first (most lives left), then whoever lasted longest.
  rows.sort((a, b) => Number(b.alive) - Number(a.alive) || b.livesLeft - a.livesLeft || (b.outWeek ?? 0) - (a.outWeek ?? 0) || a.name.localeCompare(b.name));
  const key = (r: SvRow) => `${r.alive}:${r.livesLeft}:${r.outWeek}`;
  rows.forEach((r, i) => {
    r.rank = i > 0 && key(rows[i - 1]) === key(r) ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
