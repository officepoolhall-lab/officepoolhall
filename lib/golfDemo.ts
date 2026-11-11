import "server-only";
import snapshot from "./demo/masters-2026-r3.json";
import type { LiveGolfer } from "./golfLive";
import type { Scorecard } from "./golfScorecard";

// DEMO ONLY. The 2026 demo pool's Masters, frozen in the middle of round 3, built from the real
// 2026 Masters scorecards (lib/demo/masters-2026-r3.json, made by scripts/build-masters-demo.py
// from ESPN's data). Every hole score is real; only the moment is chosen: each golfer has played
// as many round-3 holes as about 15 minutes a hole allows from their real tee time up to it.
// Tee times are moved so that moment is always "now", so the demo always reads as live.

export const DEMO_LIVE_ID = "demo-masters-2026-r3";

type SnapGolfer = {
  id: string;
  name: string;
  lastName: string;
  country: string | null;
  order: number;
  pos: string;
  out: string | null;
  toPar: string | null;
  thru: string | null;
  status: string;
  /** Minutes from the frozen moment to this golfer's latest tee time (negative = earlier). */
  teeOffsetMin: number | null;
  rounds: (number | null)[];
  total: number | null;
  /** Strokes per hole for each round played so far (round 3 partly). */
  holes: (number | null)[][];
  /** Each round's tee time, minutes from the frozen moment. */
  roundTeeOffsetMin: (number | null)[];
};
type Snapshot = { eventName: string; pars: number[]; golfers: SnapGolfer[] };
const data = snapshot as unknown as Snapshot;

// ESPN's flag images are named by country code (…/countries/500/usa.png).
const FLAG_CODE: Record<string, string> = {
  USA: "usa", England: "eng", Australia: "aus", "South Africa": "rsa", Denmark: "den", Spain: "esp", Canada: "can",
  "South Korea": "kor", "Northern Ireland": "nir", Sweden: "swe", Norway: "nor", Japan: "jpn", Argentina: "arg",
  Scotland: "sco", Fiji: "fij", "New Zealand": "nzl", Colombia: "col", Finland: "fin", Ireland: "irl", Thailand: "tha",
  Mexico: "mex", Austria: "aut", China: "chn",
};
const flagFor = (country: string | null) =>
  country && FLAG_CODE[country] ? `https://a.espncdn.com/combiner/i?img=/i/teamlogos/countries/500/${FLAG_CODE[country]}.png&w=40&h=40&scale=crop` : null;

const at = (now: number, offsetMin: number | null) => (offsetMin === null ? null : new Date(now + offsetMin * 60_000).toISOString());

/** The demo leaderboard as of now (tee times moved to fit). */
export function getDemoLeaderboard(now = Date.now()): LiveGolfer[] {
  return data.golfers.map((g) => ({
    id: g.id,
    name: g.name,
    pos: g.pos,
    toPar: g.toPar,
    thru: g.thru,
    tee: at(now, g.teeOffsetMin),
    status: g.status,
    earnings: 0,
    lastName: g.lastName,
    order: g.order,
    out: g.out,
    rounds: g.rounds,
    total: g.total,
    country: g.country,
    flag: flagFor(g.country),
  }));
}

/** One golfer's demo scorecard: rounds 1–2 in full, round 3 so far. */
export function getDemoScorecard(golferId: string): Scorecard | null {
  const g = data.golfers.find((x) => x.id === golferId);
  if (!g) return null;
  const rounds = g.holes
    .map((strokes, i) => {
      // All 18 holes, each with its par; holes not played yet have no score.
      const holes = Array.from({ length: 18 }, (_, h) => ({ hole: h + 1, par: data.pars[h] ?? null, strokes: strokes[h] ?? null }));
      const played = holes.filter((h) => h.strokes !== null);
      const sum = played.reduce((t, h) => t + (h.strokes ?? 0), 0);
      const d = sum - played.reduce((t, h) => t + (h.par ?? 0), 0);
      return { round: i + 1, strokes: played.length ? sum : null, toPar: played.length ? (d === 0 ? "E" : d > 0 ? `+${d}` : String(d)) : null, holes };
    })
    .filter((r) => r.holes.some((h) => h.strokes !== null));
  return rounds.length ? { rounds } : null;
}
