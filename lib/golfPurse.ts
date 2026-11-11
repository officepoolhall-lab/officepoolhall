import "server-only";
import { espnTournamentId } from "./golfLive";

// Each tournament's purse (total prize money), from ESPN's event data
// (sports.core.api.espn.com/.../events/{id}: purse, displayPurse; seen Nov 2026). Cached a day:
// purses are announced ahead and rarely change. Null when ESPN doesn't give one yet.

const FETCH_TIMEOUT_MS = 5000;

async function purseFor(tournamentId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${tournamentId}?lang=en&region=us`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { purse?: unknown; displayPurse?: unknown };
    const n = typeof body.purse === "number" ? body.purse : typeof body.displayPurse === "string" ? Number(body.displayPurse.replace(/[^0-9.]/g, "")) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Purse per pool event id, for these events (the demo pool's map to the real 2026 ones). */
export async function getPurses(events: { id: string; espn_id: string }[], poolSlug: string): Promise<Map<string, number>> {
  const found = await Promise.all(
    events.map(async (e) => {
      // Not the demo's frozen Masters snapshot id: purses come from the real event.
      const id = espnTournamentId(e.espn_id, poolSlug);
      return [e.id, id && /^\d+$/.test(id) ? await purseFor(id) : null] as const;
    }),
  );
  return new Map(found.filter((x): x is readonly [string, number] => x[1] !== null).map(([k, v]) => [k, v]));
}

/** "$20M", "$9.6M", "$850K". */
export function shortPurse(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  return `$${Math.round(n / 1000)}K`;
}
