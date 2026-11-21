import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { getGameSummary } from "./gameSummary";
import { cleanPlay } from "./liveClock";
import { fresh } from "./microCache";
import { getPublishedSlates, getSlateGames, type PoolContext, type SlateGame } from "./pool";
import { poolSettingsSchema } from "./poolSettings";
import { createAdminClient } from "./supabase/admin";

// The landing page's previews are the real pages, drawn from a real pool: the RT Supercontest
// (LANDING_POOL_SLUG to choose another), seen from the commissioner's entry. Every player's name
// is replaced with a made-up one. Read with the service role, since visitors aren't signed in.
//
// - My Picks and the Grid: a finished week (LANDING_PICKS_WEEK, default 8).
// - Scores and the Pool Summary: the next week (LANDING_SCORES_WEEK, default 9). Its games are
//   long over, so Scores replays them as a Sunday afternoon: each game's score, clock, down and
//   last play at one moment, rebuilt from ESPN's play-by-play, with that moment set to now.

// Made-up names: a first name and last initial, unique for up to 1,040 players (no numbers).
const FIRST = [
  "Megan", "Dave", "Priya", "Tom", "Alex", "Jordan", "Chris", "Sam", "Taylor", "Morgan",
  "Jamie", "Casey", "Riley", "Drew", "Avery", "Quinn", "Blake", "Reese", "Cameron", "Hayden",
  "Logan", "Parker", "Rowan", "Sydney", "Emerson", "Finley", "Harper", "Kendall", "Peyton", "Skyler",
  "Nick", "Laura", "Ben", "Kate", "Matt", "Erin", "Ryan", "Molly", "Greg", "Tess",
];
const fakeName = (i: number) => {
  const first = i % FIRST.length;
  const round = Math.floor(i / FIRST.length);
  return `${FIRST[first]} ${String.fromCharCode(65 + ((round + first * 7) % 26))}.`;
};

export type LandingPool = {
  ctx: PoolContext;
  slug: string;
  rename: (userId: string) => string;
  week: number;
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The pool behind the previews, as a read-only context from its commissioner's point of view. */
export async function getLandingPool(): Promise<LandingPool | null> {
  try {
    const db = createAdminClient();
    const slug = process.env.LANDING_POOL_SLUG;
    const { data: pool } = slug
      ? await db.from("pools").select("*").eq("slug", slug).maybeSingle()
      : await db.from("pools").select("*").eq("name", "RT Supercontest").maybeSingle();
    if (!pool || (pool as Row).sport === "pga") return null;
    const settings = poolSettingsSchema.parse((pool as Row).settings);
    const owner = (pool as Row).commissioner_id as string;
    const { data: members } = await db.from("pool_members").select("user_id").eq("pool_id", (pool as Row).id);
    // A fixed order, so each player keeps the same made-up name on every preview.
    const ids = ((members ?? []) as Row[]).map((m) => m.user_id as string).sort();
    const names = new Map(ids.map((id, i) => [id, fakeName(i)]));
    const ctx = {
      supabase: db,
      user: { id: owner, email: "" },
      pool,
      isCommissioner: false,
      isGuest: false,
      entryUserId: owner,
      managing: null,
      displayTz: settings.timezone,
      settings,
    } as unknown as PoolContext;
    return {
      ctx,
      slug: (pool as Row).slug,
      rename: (id) => names.get(id) ?? "Player",
      // One week for every preview (My Picks, Grid, Pool Summary, Scores).
      week: Number(process.env.LANDING_WEEK ?? process.env.LANDING_PICKS_WEEK) || 8,
    };
  } catch {
    return null;
  }
}

export async function slateFor(lp: LandingPool, week: number) {
  return (await getPublishedSlates(lp.ctx)).find((s: Row) => s.week === week) ?? null;
}

/** Every pick on a week (it's graded, so all of them are public to members). */
export async function weekPicks(lp: LandingPool, slateId: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data } = await (lp.ctx.supabase as unknown as Row)
      .from("picks")
      .select("user_id, game_id, picked_side, confidence, result, points, bonus, edited_by")
      .eq("slate_id", slateId)
      .order("user_id")
      .order("game_id")
      .range(from, from + 999);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n === 4 ? "4th" : "OT");
const GAME_MS = 3 * 3600_000 + 10 * 60_000; // about how long an NFL game runs

/**
 * The scores week as it stood partway through its Sunday: the early games late in the fourth
 * quarter, Thursday's final, the late and night games still to come. Times are moved so that
 * moment is now. ESPN ids are dropped so the board doesn't ask ESPN for live updates.
 */
export async function scoresSnapshot(lp: LandingPool, slateId: string): Promise<{ games: SlateGame[]; days: string[] } | null> {
  const games = await getSlateGames(lp.ctx, slateId);
  if (!games.length) return null;
  // The most common kickoff (the Sunday early window), then about two and a half hours in.
  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.startAt, (counts.get(g.startAt) ?? 0) + 1);
  const early = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const at = Date.parse(early) + 2.6 * 3600_000;

  const frames = await fresh(`landing-snap:${slateId}`, 6 * 3600_000, () =>
    Promise.all(
      games.map(async (g) => {
        const start = Date.parse(g.startAt);
        if (at < start) return { status: "scheduled" as const };
        if (at - start >= GAME_MS || !g.espnId) return { status: "final" as const };
        const s = await getGameSummary("nfl", g.espnId, false);
        if (!s) return { status: "final" as const };
        const plays = [...s.drives].reverse().flatMap((d) => [...d.plays].reverse()).filter((p) => p.period !== null && p.clock);
        if (!plays.length) return { status: "final" as const };
        const i = Math.min(plays.length - 1, Math.floor(((at - start) / GAME_MS) * plays.length));
        const p = plays[i];
        let home: number | null = null;
        let away: number | null = null;
        for (let j = i; j >= 0; j--) {
          if (plays[j].homeScore !== null && plays[j].awayScore !== null) {
            home = plays[j].homeScore;
            away = plays[j].awayScore;
            break;
          }
        }
        const side = p.teamId && p.teamId === s.home?.id ? "home" : p.teamId && p.teamId === s.away?.id ? "away" : null;
        const abbr = side === "home" ? s.home?.abbreviation : side === "away" ? s.away?.abbreviation : null;
        return {
          status: "live" as const,
          home: home ?? 0,
          away: away ?? 0,
          clock: `${p.clock} ${ordinal(p.period!)}`,
          lastPlay: cleanPlay(p.text),
          situation: p.down ? (abbr ? `${abbr} · ${p.down}` : p.down) : null,
          possession: side as "home" | "away" | null,
        };
      }),
    ),
  );

  const shift = Date.now() - at;
  const moved = (iso: string) => new Date(Date.parse(iso) + shift).toISOString();
  const out: SlateGame[] = games.map((g, k) => {
    const f = frames[k];
    const base = { ...g, startAt: moved(g.startAt), effectiveLockAt: moved(g.effectiveLockAt), lockAt: g.lockAt ? moved(g.lockAt) : null, espnId: null, overridden: false };
    if (f.status === "scheduled") return { ...base, status: "scheduled", homeScore: null, awayScore: null };
    if (f.status === "final") return { ...base, status: "final" };
    return { ...base, status: "in_progress", homeScore: f.home, awayScore: f.away, clock: f.clock, lastPlay: f.lastPlay, situation: f.situation, possession: f.possession };
  });
  const days = [...new Set(out.map((g) => formatInTimeZone(g.startAt, lp.ctx.displayTz, "yyyy-MM-dd")))].sort();
  return { games: out, days };
}
