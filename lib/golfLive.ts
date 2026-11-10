import "server-only";

// ESPN's PGA Tour leaderboard page, read live for the home page ticker: each golfer's place,
// score to par, holes played and tee time. Same embedded data the scheduled import reads
// (supabase/functions/_shared/golf.ts); this copy keeps a few more fields and never writes.
//
// Fields confirmed on a final page (Nov 2026): name, lastNm, id, pos, status, tee (ISO, the
// golfer's latest round), thru (a number), toPar, tot, order (leaderboard order), "$$".
// Not yet seen on a pre-event or in-progress page, so each is optional; anything missing
// just doesn't show.

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
      thru: thru === "18" ? "F" : thru,
      tee: teeTime(o.tee),
      status: typeof o.status === "string" ? o.status : "",
      earnings: Number(o["$$"]) || 0,
      lastName: typeof o.lastNm === "string" && o.lastNm ? o.lastNm : o.name.split(" ").slice(-1)[0],
      order: typeof o.order === "number" ? o.order : null,
      // ESPN marks a missed cut with cut:true and "CUT" where the tee time goes (WD, DQ likewise).
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

/** One golfer's live line: "T12 · −4 · Thru 9"; null when not on the page. */
export async function getLivePickLine(espnId: string, golferId: string): Promise<string | null> {
  const g = (await getLiveLeaderboard(espnId, 120))?.find((x) => x.id === golferId);
  if (!g) return null;
  const parts = [g.pos !== "-" ? g.pos : null, g.toPar ? formatToPar(g.toPar) : null, g.thru ? (g.thru === "F" ? "F" : `Thru ${g.thru}`) : null];
  const line = parts.filter(Boolean).join(" · ");
  return line || null;
}
