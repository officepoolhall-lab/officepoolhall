import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// The whole NFL season's schedule, from ESPN, into the games table every pool shares: the 18
// regular-season weeks and the playoffs (one request a week, 22 in all). Run when an NFL pool is
// created, every morning (Vercel Cron, /api/nfl/schedule) and from Commissioner → Slate's
// Sync ESPN schedule, so every NFL week's games are always there and time changes (flexed
// games, Saturday games set late in the season) reach every NFL pool. Same parsing and the same
// ingest_espn as the sync-schedule edge function, which still loads the next 14 days daily.

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
/** [season type, week]: regular season 1–18; playoffs Wild Card, Divisional, Conference, Super Bowl. */
const WEEKS: [number, number][] = [...Array.from({ length: 18 }, (_, i): [number, number] => [2, i + 1]), [3, 1], [3, 2], [3, 3], [3, 5]];

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function mapStatus(type: { name?: string; state?: string; completed?: boolean }) {
  const name = type.name ?? "";
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCELED") || name.includes("CANCELLED") || name.includes("FORFEIT")) return "cancelled";
  if (type.completed || type.state === "post") return "final";
  if (type.state === "in" || name.includes("DELAYED") || name.includes("SUSPENDED")) return "in_progress";
  return "scheduled";
}

function venueLabel(address: { city?: string; state?: string; country?: string } | undefined) {
  if (!address?.city) return null;
  const region = address.state || address.country;
  return region ? `${address.city}, ${region}` : address.city;
}

/** One NFL week's games and teams, in ingest_espn's shape. */
async function fetchWeek(season: number, type: number, week: number) {
  const res = await fetch(`${SCOREBOARD}?seasontype=${type}&week=${week}&dates=${season}&limit=100`, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${season} week ${type}-${week}`);
  const data = (await res.json()) as Row;
  const teams = new Map<string, Row>();
  const games: Row[] = [];
  for (const e of (data.events ?? []) as Row[]) {
    const c = e.competitions?.[0];
    const home = c?.competitors?.find((x: Row) => x.homeAway === "home");
    const away = c?.competitors?.find((x: Row) => x.homeAway === "away");
    if (!home || !away) continue;
    for (const side of [home, away]) {
      const t = side.team;
      teams.set(String(t.id), {
        espn_id: String(t.id),
        name: t.displayName,
        short_name: t.shortDisplayName ?? t.location ?? t.displayName,
        abbreviation: t.abbreviation,
        logo_url: t.logo ?? null,
        conference: null,
      });
    }
    const status = mapStatus(c.status?.type ?? e.status?.type ?? {});
    const started = status === "in_progress" || status === "final";
    const national = (c.broadcasts ?? []).find((b: Row) => b.market === "national") ?? c.broadcasts?.[0];
    games.push({
      espn_id: String(e.id),
      season: Number(e.season?.year ?? season),
      home_espn_id: String(home.team.id),
      away_espn_id: String(away.team.id),
      start_at: new Date(e.date).toISOString(),
      time_tbd: c.timeValid === false,
      status,
      home_score: started ? Number(home.score) : null,
      away_score: started ? Number(away.score) : null,
      neutral_site: Boolean(c.neutralSite),
      tv_network: national?.names?.join("/") || null,
      home_rank: null,
      away_rank: null,
      venue: venueLabel(c.venue?.address),
    });
  }
  return { teams: [...teams.values()], games };
}

/** The NFL season a date falls in: September through February belongs to the year it started. */
export const nflSeasonOf = (at: Date = new Date()) => (at.getUTCMonth() < 2 ? at.getUTCFullYear() - 1 : at.getUTCFullYear());

/** Loads (or refreshes) every game of an NFL season. Returns how many games ESPN listed. */
export async function syncNflSeason(season: number = nflSeasonOf()): Promise<{ games: number; weeks: number; error?: string }> {
  const db = createAdminClient() as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
  // All 22 weeks at once (a few seconds), then one ingest.
  let feeds: Awaited<ReturnType<typeof fetchWeek>>[];
  try {
    feeds = await Promise.all(WEEKS.map(([type, week]) => fetchWeek(season, type, week)));
  } catch (e) {
    return { games: 0, weeks: 0, error: e instanceof Error ? e.message : String(e) };
  }
  const teams = new Map<string, Row>();
  const games = new Map<string, Row>();
  for (const f of feeds) {
    for (const t of f.teams) teams.set(t.espn_id, t);
    for (const g of f.games) games.set(g.espn_id, g);
  }
  if (!games.size) return { games: 0, weeks: 0, error: "ESPN listed no games for that season" };
  const { error } = await db.rpc("ingest_espn", { p_sport: "nfl", p_teams: [...teams.values()], p_games: [...games.values()] });
  if (error) return { games: 0, weeks: 0, error: error.message };
  return { games: games.size, weeks: feeds.filter((f) => f.games.length).length };
}
