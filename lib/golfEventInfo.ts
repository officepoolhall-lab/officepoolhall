import "server-only";
import { espnTournamentId } from "./golfLive";

// Each tournament's purse (total prize money), whether it's a Signature Event, and its start
// date, from ESPN's event data (sports.core.api.espn.com/.../events/{id}: purse, displayPurse,
// isSignature, date; the fields seen Nov 2026). Cached a day: both are announced ahead and rarely change.

const FETCH_TIMEOUT_MS = 5000;

export type EventInfo = {
  purse: number | null;
  signature: boolean;
  /** The tournament's first day (yyyy-MM-dd), known long before tee times are posted. */
  startDate: string | null;
};
const NONE: EventInfo = { purse: null, signature: false, startDate: null };

async function infoFor(tournamentId: string): Promise<EventInfo> {
  try {
    const res = await fetch(`https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${tournamentId}?lang=en&region=us`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return NONE;
    const body = (await res.json()) as { purse?: unknown; displayPurse?: unknown; isSignature?: unknown; date?: unknown };
    const n = typeof body.purse === "number" ? body.purse : typeof body.displayPurse === "string" ? Number(body.displayPurse.replace(/[^0-9.]/g, "")) : NaN;
    // ESPN dates an event at midnight Eastern of its first day (e.g. 2025-04-10T04:00Z), so the
    // day is read in Eastern time.
    const startDate =
      typeof body.date === "string" && !Number.isNaN(Date.parse(body.date))
        ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(body.date))
        : null;
    return { purse: Number.isFinite(n) && n > 0 ? n : null, signature: body.isSignature === true, startDate };
  } catch {
    return NONE;
  }
}

/** Purse and Signature status per pool event id (the demo pool's events map to the real 2026 ones). */
export async function getEventInfo(events: { id: string; espn_id: string }[], poolSlug: string): Promise<Map<string, EventInfo>> {
  const found = await Promise.all(
    events.map(async (e) => {
      // Not the demo's frozen Masters snapshot id: these come from the real event.
      const id = espnTournamentId(e.espn_id, poolSlug);
      return [e.id, id && /^\d+$/.test(id) ? await infoFor(id) : NONE] as const;
    }),
  );
  return new Map(found);
}

/** "$20M", "$9.6M", "$850K". */
export function shortPurse(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  return `$${Math.round(n / 1000)}K`;
}
