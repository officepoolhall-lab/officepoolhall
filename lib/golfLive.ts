import "server-only";
import { DEMO_LIVE_ID, getDemoLeaderboard } from "./golfDemo";

// ESPN's PGA Tour leaderboard page, read live for the home page ticker: each golfer's place,
// score to par, holes played and tee time. Same embedded data the scheduled import reads
// (supabase/functions/poll-golf/index.ts); this copy keeps a few more fields and never writes.
//
// Fields confirmed (Nov 2026) on final and pre-event pages: name, lastNm, id, pos, status
// ("pre"/"post"), tee (ISO, the golfer's latest round), thru (a number; 0 before starting),
// toPar ("-" before starting), tot ("--" before starting), r1–r4, order, "$$". Not yet seen on
// an in-progress page, so each is optional; anything missing just doesn't show.

const FETCH_TIMEOUT_MS = 5000;

export type LiveGolfer = {
  id: string;
  name: string;
  /** "1", "T7", "CUT", "WD", or "-" before the event. */
  pos: string;
  /** "-12", "E", "+3"; null before the golfer starts. */
  toPar: string | null;
  /** "F", "14", or null. */
  thru: string | null;
  /** ISO time of the golfer's next (or first) tee time, when ESPN has one. */
  tee: string | null;
  /** "pre", "in" or "post". */
  status: string;
  earnings: number;
  lastName: string;
  /** ESPN's own leaderboard order (1 = top); null when not given. */
  order: number | null;
  /** "MC", "WD" or "DQ" for a golfer who didn't finish; null otherwise. */
  out: string | null;
  /** Strokes in each round played (r1–r4); null for a round not played (yet). */
  rounds: (number | null)[];
  /** Total strokes so far. */
  total: number | null;
  /** Three-letter country, when given. */
  country: string | null;
  /** ESPN's flag image for the golfer's country, when given. */
  flag: string | null;
};

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** A tee time ESPN gave as an ISO string or a millisecond timestamp. */
function teeTime(v: unknown): string | null {
  if (typeof v === "number" && v > 1e12) return new Date(v).toISOString();
  const s = str(v);
  if (!s || Number.isNaN(Date.parse(s))) return null;
  return new Date(s).toISOString();
}

export function parseLiveGolfers(html: string): LiveGolfer[] {
  const byId = new Map<string, LiveGolfer>();
  for (const m of html.matchAll(/\{"guid":[^{}]*\}/g)) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(m[0]);
    } catch {
      continue;
    }
    if (typeof o.name !== "string" || o.id === undefined) continue;
    // Golfer objects carry a place, score or prize money; other "guid" objects on the page don't.
    if (!("pos" in o || "toPar" in o || "$$" in o)) continue;
    const thru = str(o.thru);
    byId.set(String(o.id), {
      id: String(o.id),
      name: o.name,
      pos: str(o.pos) ?? "-",
      // A golfer who hasn't started has no score yet ("-" or nothing).
      toPar: str(o.toPar) === "-" ? null : str(o.toPar),
      // Before a golfer starts, ESPN sends thru 0 (checked Nov 2026: status "pre", toPar "-").
      thru: thru === "18" ? "F" : thru === "0" ? null : thru,
      tee: teeTime(o.tee),
      status: typeof o.status === "string" ? o.status : "",
      earnings: Number(o["$$"]) || 0,
      lastName: typeof o.lastNm === "string" && o.lastNm ? o.lastNm : o.name.split(" ").slice(-1)[0],
      order: typeof o.order === "number" ? o.order : null,
      // ESPN marks a missed cut with cut:true and "CUT" where the tee time goes (WD, DQ likewise).
      rounds: [o.r1, o.r2, o.r3, o.r4].map((r) => (typeof r === "number" && r > 0 ? r : null)),
      total: typeof o.tot === "number" && o.tot > 0 ? o.tot : null,
      country: typeof o.flagCountry === "string" ? o.flagCountry : null,
      flag: typeof o.flag === "string" && o.flag.startsWith("https://") ? o.flag : null,
      out: o.cut === true || o.tee === "CUT" ? "MC" : typeof o.tee === "string" && /^[A-Z]{2,4}$/.test(o.tee) ? o.tee : null,
    });
  }
  return [...byId.values()];
}

/**
 * The live leaderboard for one ESPN event, cached `revalidate` seconds. Null when the page
 * can't be read (ESPN down, a demo event, or the page's shape changed).
 */
export async function getLiveLeaderboard(espnId: string, revalidate = 120, timeoutMs = FETCH_TIMEOUT_MS): Promise<LiveGolfer[] | null> {
  // The demo pool's Masters, frozen mid-round 3 (lib/golfDemo.ts).
  if (espnId === DEMO_LIVE_ID) return getDemoLeaderboard();
  if (!/^\d+$/.test(espnId)) return null;
  try {
    const res = await fetch(`https://www.espn.com/golf/leaderboard/_/tournamentId/${espnId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const golfers = parseLiveGolfers(await res.text());
    return golfers.length ? golfers : null;
  } catch {
    return null;
  }
}

/** Sort key for a finishing position: "1" and "T1" first, then the rest; CUT, WD and "-" last. */
export function posRank(pos: string | null) {
  const n = parseInt((pos ?? "").replace(/^T/, ""), 10);
  return Number.isFinite(n) ? n : 9999;
}

/** "-12" → "−12" (a true minus sign), "E" and "+3" unchanged. */
export function formatToPar(toPar: string | null) {
  return toPar ? toPar.replace(/^-/, "−") : "";
}

/**
 * The round being played, for the "Live · Round 3" label. From ESPN's scoreboard for the event
 * (status.period, cached two minutes); otherwise worked out from the leaderboard: the most
 * rounds any golfer has finished, plus one if someone is part-way through the next.
 */
export async function currentRound(tournamentId: string, golfers: LiveGolfer[] | null): Promise<number | null> {
  if (tournamentId === DEMO_LIVE_ID) return 3;
  if (/^\d+$/.test(tournamentId)) {
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${tournamentId}`, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
        next: { revalidate: 120 },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.ok) {
        const body = (await res.json()) as { events?: { competitions?: { status?: { period?: unknown } }[] }[] };
        const period = body.events?.[0]?.competitions?.[0]?.status?.period;
        if (typeof period === "number" && period >= 1 && period <= 4) return period;
      }
    } catch {
      // fall back to the leaderboard below
    }
  }
  if (!golfers?.length) return null;
  const finished = Math.max(0, ...golfers.filter((g) => !g.out).map((g) => g.rounds.filter((r) => r !== null).length));
  const midRound = golfers.some((g) => !g.out && g.thru !== null && g.thru !== "F");
  return Math.min(4, Math.max(1, finished + (midRound ? 1 : 0)));
}

/**
 * The ESPN tournament behind a pool event. The 2026 demo pool's events are stored as "demo-1"
 * to "demo-37" so the importer never touches them; they are the 2026 season's events in order
 * (Sony Open, 401811928, onward), and the pages read those. Its Masters (demo-14), while under
 * way, is the frozen mid-round-3 snapshot instead (lib/golfDemo.ts).
 */
export function espnTournamentId(espnId: string, poolSlug: string, status?: string): string | null {
  if (/^\d+$/.test(espnId)) return espnId;
  const demo = espnId.match(/^demo-0*(\d+)$/);
  if (!demo || poolSlug !== "demo-pga-2026") return null;
  if (Number(demo[1]) === 14 && status === "in_progress") return DEMO_LIVE_ID;
  return String(401811927 + Number(demo[1]));
}
