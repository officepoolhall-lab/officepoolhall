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
  /**
   * Demo pools only (set in the database, not on Settings): show the season as if this week
   * were being played right now. Later weeks are hidden and this week's games show as in
   * progress with made-up scores.
   */
  demo_live_week?: number | null;
  /**
   * Demo pools only (set in the database): made-up final scores, game id → [home, away], for
   * games not over yet, so a demo can be moved ahead to a later week. The real game records
   * (shared with every pool) are never changed.
   */
  demo_results?: Record<string, [number, number]> | null;
  /**
   * Demo pools only (set in the database): show the pool as of this moment (ISO time). Games
   * after it look not started (no score), and picks lock against it (migration 065).
   */
  demo_now?: string | null;
};

export const SURVIVOR_DEFAULT: SurvivorSettings = { lives: 1, tie: "loss", reuse: false, start_week: 1 };

export function survivorSettings(settings: unknown): SurvivorSettings {
  const s = block(settings, "survivor");
  return {
    lives: int(s.lives, 1, 3) ?? 1,
    tie: s.tie === "win" ? "win" : "loss",
    reuse: s.reuse === true,
    start_week: int(s.start_week, 1, 30) ?? 1,
    demo_live_week: int(s.demo_live_week, 1, 30) ?? null,
    demo_results: demoResults(s.demo_results),
    demo_now: typeof s.demo_now === "string" && !Number.isNaN(Date.parse(s.demo_now)) ? s.demo_now : null,
  };
}

function demoResults(v: unknown): Record<string, [number, number]> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, [number, number]> = {};
  for (const [id, r] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(r) && r.length === 2 && r.every((n) => Number.isInteger(n) && (n as number) >= 0)) out[id] = [r[0] as number, r[1] as number];
  }
  return Object.keys(out).length ? out : null;
}

/** A demo pool shown as of an earlier moment (settings.demo_now): later games not started. */
export function applyDemoNow(weeks: SvWeek[], demoNow: string | null | undefined): SvWeek[] {
  if (!demoNow) return weeks;
  const at = Date.parse(demoNow);
  return weeks.map((w) => ({
    ...w,
    games: w.games.map((g) =>
      Date.parse(g.startAt) > at ? { ...g, started: false, final: false, homeScore: null, awayScore: null, clock: null } : g,
    ),
  }));
}

/** A demo pool's made-up finals (settings.demo_results) laid over its games. */
export function applyDemoResults(weeks: SvWeek[], results: Record<string, [number, number]> | null | undefined): SvWeek[] {
  if (!results) return weeks;
  return weeks.map((w) => ({
    ...w,
    games: w.games.map((g) => {
      const r = results[g.id];
      // Listed games keep their made-up final even after the real game ends, so a demo stays as set.
      if (!r || g.voided) return g;
      return { ...g, started: true, final: true, homeScore: r[0], awayScore: r[1], clock: null };
    }),
  }));
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
   * eliminated. before: the week closed before this entry joined. split: the pot was split
   * this week and this entry shares it.
   */
  state: SvResult | "missed" | "open" | "out" | "before" | "split";
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
export function survivorStandings(weeks: SvWeek[], picks: SvPick[], members: SvMember[], s: SurvivorSettings, split?: SvSplit | null): SvRow[] {
  // A split pool ends in the week it was split.
  const cut = split?.week ?? null;
  const counted = weeks.filter((w) => w.week >= s.start_week && (cut === null || w.week <= cut)).sort((a, b) => a.week - b.week);
  const pickOf = new Map(picks.map((p) => [`${p.slateId}:${p.userId}`, p]));
  const rows = members.map((m): SvRow => {
    let losses = 0;
    let outWeek: number | null = null;
    const used = new Map<string, number>();
    const cells = counted.map((w): SvCell => {
      const base = { week: w.week, slateId: w.slateId };
      if (outWeek !== null) return { ...base, team: null, state: "out" };
      if (cut !== null && w.week >= cut) return { ...base, team: null, state: split?.userIds.includes(m.userId) ? "split" : "out" };
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

const FOOTBALL_SCORES = [0, 3, 6, 7, 10, 13, 14, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 38, 41, 42, 45];
const hash = (id: string) => Math.imul([...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7), 2654435761) >>> 8;

/**
 * A demo pool "live" in one week: weeks after it are dropped, and that week's games after its
 * first day show as in progress, each part-way through with a made-up score and clock (the
 * same every time the page loads). The first day's games (Thursday night) stay final.
 */
export function demoLive(weeks: SvWeek[], liveWeek: number): SvWeek[] {
  return weeks
    .filter((w) => w.week <= liveWeek)
    .map((w) => {
      if (w.week !== liveWeek) return w;
      const firstDay = w.games.map((g) => g.startAt).sort()[0]?.slice(0, 10);
      return {
        ...w,
        games: w.games.map((g): SvGame => {
          if (g.voided || !g.final || g.homeScore === null || g.awayScore === null) return g;
          if (g.startAt.slice(0, 10) <= (firstDay ?? "")) return g;
          const h = hash(g.id);
          const done = 0.3 + (h % 50) / 100; // 30% to 79% of the way through
          const part = (final: number) => [...FOOTBALL_SCORES].reverse().find((v) => v <= final * done) ?? 0;
          const quarter = done < 0.5 ? "2nd" : done < 0.75 ? "3rd" : "4th";
          const clock = `${(h >> 6) % 15}:${String((h >> 11) % 60).padStart(2, "0")} ${quarter}`;
          return { ...g, started: true, final: false, homeScore: part(g.homeScore), awayScore: part(g.awayScore), clock };
        }),
      };
    });
}

/**
 * Who has won the pool, once it's decided: the last entry standing; or, when everyone left
 * goes out in the same week, all of them (they share it). Decided means the week that left
 * one (or none) standing is over: every game in it final. Undecided: null.
 */
/** An agreed split: every entry still alive asked to end the pool and share the pot (migration 067). */
export type SvSplit = { userIds: string[]; week: number | null };

export function survivorWinners(rows: SvRow[], weeks: SvWeek[], split?: SvSplit | null): { userIds: string[]; week: number; split?: boolean } | null {
  if (split?.userIds.length) return { userIds: split.userIds, week: split.week ?? 0, split: true };
  if (rows.length < 2) return null;
  const alive = rows.filter((r) => r.alive);
  if (alive.length > 1) return null;
  const lastOut = Math.max(0, ...rows.map((r) => r.outWeek ?? 0));
  if (!lastOut) return null;
  const week = weeks.find((w) => w.week === lastOut);
  if (!week || !week.games.filter((g) => !g.voided).every((g) => g.final)) return null;
  const userIds = alive.length === 1 ? [alive[0].userId] : rows.filter((r) => r.outWeek === lastOut).map((r) => r.userId);
  return { userIds, week: lastOut };
}
