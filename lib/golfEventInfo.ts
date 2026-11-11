import "server-only";
import { espnTournamentId } from "./golfLive";

// Each tournament's purse (total prize money) and whether it's a Signature Event, from ESPN's
// event data (sports.core.api.espn.com/.../events/{id}: purse, displayPurse, isSignature; the
// fields seen Nov 2026). Cached a day: both are announced ahead and rarely change.

const FETCH_TIMEOUT_MS = 5000;

export type EventInfo = { purse: number | null; signature: boolean };

async function infoFor(tournamentId: string): Promise<EventInfo> {
  try {
    const res = await fetch(`https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${tournamentId}?lang=en&region=us`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { purse: null, signature: false };
    const body = (await res.json()) as { purse?: unknown; displayPurse?: unknown; isSignature?: unknown };
    const n = typeof body.purse === "number" ? body.purse : typeof body.displayPurse === "string" ? Number(body.displayPurse.replace(/[^0-9.]/g, "")) : NaN;
    return { purse: Number.isFinite(n) && n > 0 ? n : null, signature: body.isSignature === true };
  } catch {
    return { purse: null, signature: false };
  }
}

/** Purse and Signature status per pool event id (the demo pool's events map to the real 2026 ones). */
export async function getEventInfo(events: { id: string; espn_id: string }[], poolSlug: string): Promise<Map<string, EventInfo>> {
  const found = await Promise.all(
    events.map(async (e) => {
      // Not the demo's frozen Masters snapshot id: these come from the real event.
      const id = espnTournamentId(e.espn_id, poolSlug);
      return [e.id, id && /^\d+$/.test(id) ? await infoFor(id) : { purse: null, signature: false }] as const;
    }),
  );
  return new Map(found);
}

/** "$20M", "$9.6M", "$850K". */
export function shortPurse(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  return `$${Math.round(n / 1000)}K`;
}
