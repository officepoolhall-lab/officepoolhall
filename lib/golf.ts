import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getPoolBase, type PoolBase } from "./pool";
import { fromZonedTime } from "date-fns-tz";
import { getViewerTimeZone } from "./viewerTime";

/** Golf times show in Central unless the viewer's browser reports another zone. */
export const GOLF_TZ = "America/Chicago";

export const getGolfContext = cache(async (slug: string) => {
  const base = await getPoolBase(slug);
  if (base.pool.sport !== "pga") notFound();
  const displayTz = await getViewerTimeZone(GOLF_TZ);
  return { ...base, displayTz };
});
export type GolfContext = Awaited<ReturnType<typeof getGolfContext>>;

export type GolfEvent = {
  id: string;
  espn_id: string;
  name: string;
  sort_order: number;
  start_at: string | null;
  status: "scheduled" | "in_progress" | "final" | "canceled";
  /** When picks open, if set by hand; otherwise 7 a.m. Central on the Monday of its week. */
  picks_open_at: string | null;
};

export type GolfResult = {
  espn_golfer_id: string;
  golfer_name: string;
  pos: string | null;
  earnings: number;
  /** First-round tee time, when stored (the demo's Masters); live events read ESPN instead. */
  tee_at: string | null;
};

export type GolfPick = {
  user_id: string;
  event_id: string;
  espn_golfer_id: string;
  golfer_name: string;
};

export type GolfStanding = {
  user_id: string;
  display_name: string;
  season_earnings: number;
  events_picked: number;
};

/**
 * When picks open for an event: its own picks_open_at if set (the demo pool), otherwise 7:00 a.m.
 * Central on the Monday of the week of its first tee time. Null until the tee time is known.
 * Matches the database's golf_default_picks_open.
 */
export function picksOpenAt(ev: GolfEvent): string | null {
  if (ev.picks_open_at) return ev.picks_open_at;
  if (!ev.start_at) return null;
  return fromZonedTime(`${mondayOfWeek(ev.start_at, "America/Chicago")}T07:00:00`, "America/Chicago").toISOString();
}

/** The Monday (yyyy-MM-dd) of the Monday–Sunday week containing this moment, in a time zone. */
export function mondayOfWeek(iso: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  const back = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  // Date-only arithmetic in UTC, so no clock change can shift the day.
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - back));
  return d.toISOString().slice(0, 10);
}

/** An event takes picks from its opening (Monday 7 a.m.) until its first tee time, while scheduled. */
export function isOpenForPicks(ev: GolfEvent, now = Date.now()) {
  const opens = picksOpenAt(ev);
  return ev.status === "scheduled" && !!ev.start_at && Date.parse(ev.start_at) > now && !!opens && Date.parse(opens) <= now;
}

/** Picks aren't open yet, but will be: the tee time is known and the opening is still ahead. */
export function opensLater(ev: GolfEvent, now = Date.now()) {
  const opens = picksOpenAt(ev);
  return ev.status === "scheduled" && !!opens && Date.parse(opens) > now;
}

/** The API returns at most 1,000 rows a request; this reads every page of a larger result. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data } = await page(from, from + size - 1);
    rows.push(...(data ?? []));
    if ((data ?? []).length < size) return rows;
  }
}

/** Events in calendar order for this pool. */
export const getGolfEvents = cache(async (ctx: PoolBase): Promise<GolfEvent[]> => {
  const { data } = await ctx.supabase
    .from("golf_events")
    .select("id, espn_id, name, sort_order, start_at, status, picks_open_at")
    .eq("pool_id", ctx.pool.id)
    .order("sort_order");
  return (data ?? []) as GolfEvent[];
});

/** The field and finishes for one event, best earnings first. */
export const getGolfResults = cache(async (ctx: PoolBase, eventId: string): Promise<GolfResult[]> => {
  const { data } = await ctx.supabase
    .from("golf_results")
    .select("espn_golfer_id, golfer_name, pos, earnings, tee_at")
    .eq("event_id", eventId)
    .order("earnings", { ascending: false })
    .order("golfer_name");
  return (data ?? []) as GolfResult[];
});

/** Picks for the entry this viewer acts for (their own, or the one they co-manage). */
export const getGolfMyPicks = cache(async (ctx: GolfContext): Promise<GolfPick[]> => {
  const { data } = await ctx.supabase
    .from("golf_picks")
    .select("user_id, event_id, espn_golfer_id, golfer_name")
    .eq("pool_id", ctx.pool.id)
    .eq("user_id", ctx.entryUserId);
  return (data ?? []) as GolfPick[];
});


/** Every pick the viewer can see: their own, plus everyone's for events that have started. */
export const getGolfVisiblePicks = cache(async (ctx: PoolBase): Promise<GolfPick[]> => {
  return allRows<GolfPick>((from, to) =>
    ctx.supabase
      .from("golf_picks")
      .select("user_id, event_id, espn_golfer_id, golfer_name")
      .eq("pool_id", ctx.pool.id)
      .order("event_id")
      .order("user_id")
      .range(from, to),
  );
});

/** Finishes for these golfers in these events, keyed "eventId|golferId" (for a whole pool's picks). */
export async function getGolfResultsFor(ctx: PoolBase, eventIds: string[], golferIds: string[]): Promise<Map<string, GolfResult>> {
  if (!eventIds.length || !golferIds.length) return new Map();
  const rows = await allRows<GolfResult & { event_id: string }>((from, to) =>
    ctx.supabase
      .from("golf_results")
      .select("event_id, espn_golfer_id, golfer_name, pos, earnings, tee_at")
      .in("event_id", eventIds)
      .in("espn_golfer_id", golferIds)
      .order("event_id")
      .order("espn_golfer_id")
      .range(from, to),
  );
  return new Map(rows.map((r) => [`${r.event_id}|${r.espn_golfer_id}`, { ...r, earnings: Number(r.earnings) }] as [string, GolfResult]));
}

/** Where each of these picks finished: keyed "eventId|golferId". */
export async function getGolfPickResults(ctx: PoolBase, picks: GolfPick[]): Promise<Map<string, GolfResult>> {
  if (!picks.length) return new Map();
  const { data } = await ctx.supabase
    .from("golf_results")
    .select("event_id, espn_golfer_id, golfer_name, pos, earnings, tee_at")
    .in("event_id", [...new Set(picks.map((p) => p.event_id))])
    .in("espn_golfer_id", [...new Set(picks.map((p) => p.espn_golfer_id))]);
  const wanted = new Set(picks.map((p) => `${p.event_id}|${p.espn_golfer_id}`));
  return new Map(
    (data ?? [])
      .map((r) => [`${r.event_id}|${r.espn_golfer_id}`, { ...r, earnings: Number(r.earnings) }] as [string, GolfResult])
      .filter(([k]) => wanted.has(k)),
  );
}

/** A golfer's finish as shown: "T7", "WD", or "MC" for a final event with no place. */
export function finishLabel(pos: string | null | undefined, eventFinal: boolean) {
  if (pos && pos !== "-") return pos;
  return eventFinal ? "MC" : "";
}

/**
 * What a week with no pick earns, set by the commissioner (pools.settings.missed_pick): $0, or
 * the lowest prize money any entry that picked earned that week. Matches golf_standings.
 */
export type MissedPickRule = "zero" | "lowest";
export function missedPickRule(pool: { settings: unknown }): MissedPickRule {
  return (pool.settings as Record<string, unknown> | null)?.missed_pick === "lowest" ? "lowest" : "zero";
}

/** For each of these final events, what a missed pick earns under the pool's rule. */
export async function getMissedPickValues(ctx: PoolBase, eventIds: string[]): Promise<Map<string, number>> {
  if (!eventIds.length || missedPickRule(ctx.pool) === "zero") return new Map(eventIds.map((id) => [id, 0]));
  const picks = (await getGolfVisiblePicks(ctx)).filter((p) => eventIds.includes(p.event_id));
  const results = await getGolfResultsFor(ctx, eventIds, [...new Set(picks.map((p) => p.espn_golfer_id))]);
  const low = new Map<string, number>(eventIds.map((id) => [id, 0]));
  for (const id of eventIds) {
    const amounts = picks.filter((p) => p.event_id === id).map((p) => results.get(`${id}|${p.espn_golfer_id}`)?.earnings ?? 0);
    if (amounts.length) low.set(id, Math.min(...amounts));
  }
  return low;
}

/** Season prize money per entry, from the database's golf_standings (every page of it). */
export const getGolfStandings = cache(async (ctx: PoolBase): Promise<GolfStanding[]> => {
  const rows = await allRows<GolfStanding>((from, to) => ctx.supabase
      .rpc("golf_standings", { p_pool_id: ctx.pool.id })
      // A fixed order, so the pages line up with no entry skipped or repeated.
      .order("season_earnings", { ascending: false })
      .order("display_name")
      .order("user_id")
      .range(from, to),
  );
  return rows.map((s) => ({ ...s, season_earnings: Number(s.season_earnings) }));
});

/** Every entry in the pool (all pages), for Standings and the Grid. */
export const getGolfMembers = cache(async (ctx: PoolBase): Promise<{ user_id: string; display_name: string }[]> => {
  const rows = await allRows<{ user_id: string; profile: unknown }>((from, to) =>
    ctx.supabase
      .from("pool_members")
      .select("user_id, profile:profiles ( display_name )")
      .eq("pool_id", ctx.pool.id)
      .order("user_id")
      .range(from, to),
  );
  return rows.map((m) => ({
    user_id: m.user_id,
    display_name: (m.profile as { display_name: string } | null)?.display_name ?? "Player",
  }));
});

// How golf fans say these, where the rule below would read oddly.
const SHORT: Record<string, string> = {
  "the open": "The Open",
  "go by raymond james": "Raymond James",
  "texas children's houston open": "Houston Open",
  "the cj cup byron nelson": "Byron Nelson",
  "valero texas open": "Valero",
  "wm phoenix open": "Phoenix",
  "at&t pebble beach pro-am": "Pebble Beach",
  "the american express": "AmEx",
  "farmers insurance open": "Farmers",
  "cognizant classic in the palm beaches": "Cognizant",
};

/** "Arnold Palmer Invitational pres. by Mastercard" → "Arnold Palmer"; "Masters Tournament" → "Masters". */
export function shortEventName(name: string) {
  const known = SHORT[name.toLowerCase()];
  if (known) return known;
  let n = name.replace(/\s+(pres\.|presented)\s+by\s+.*$/i, "").replace(/^the\s+/i, "");
  const trimmed = n.replace(/\s+(Tournament|Championship|Invitational|Classic|Pro-Am)$/i, "");
  // Keep "U.S. Open"-style names whole; otherwise the first two words are enough.
  if (trimmed.split(" ").length > 1 || trimmed.length > 6) n = trimmed;
  const words = n.split(" ");
  return words.length > 2 ? words.slice(0, 2).join(" ") : n;
}

export function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export type GolfTickerMode = "results" | "tees" | "live";

/**
 * What the home page leads with this week (days in Central time, the Tour's own calendar):
 * - live: an event is under way, whatever the day.
 * - results: Monday and Tuesday, the event that just finished.
 * - tees: from Wednesday, the coming event's field and tee times.
 * `current` is the event picks are for: the one under way, else the next one not yet final.
 */
export function golfWeek(events: GolfEvent[], now = Date.now()) {
  const counted = events.filter((e) => e.status !== "canceled");
  const live = counted.find((e) => e.status === "in_progress");
  const upcoming = counted.find((e) => e.status === "scheduled");
  const lastFinal = [...counted].reverse().find((e) => e.status === "final");
  const current = live ?? upcoming ?? null;
  const weekday = dayOfWeek(now);
  let mode: GolfTickerMode | null;
  let tickerEvent: GolfEvent | null;
  if (live) [mode, tickerEvent] = ["live", live];
  else if ((weekday === 1 || weekday === 2) && lastFinal) [mode, tickerEvent] = ["results", lastFinal];
  else if (upcoming) [mode, tickerEvent] = ["tees", upcoming];
  else if (lastFinal) [mode, tickerEvent] = ["results", lastFinal];
  else [mode, tickerEvent] = [null, null];
  return {
    current,
    /** "Week 14 of 37": the event's place among the season's counted events. */
    weekNumber: current ? counted.indexOf(current) + 1 : null,
    weeks: counted.length,
    mode,
    tickerEvent,
  };
}

/** ISO weekday in Central time: 1 Monday … 7 Sunday. */
function dayOfWeek(now: number) {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: GOLF_TZ, weekday: "short" }).format(now);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(short) + 1;
}
