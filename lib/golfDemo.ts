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
  }));
}

/** One golfer's demo scorecard: rounds 1–2 in full, round 3 so far. */
export function getDemoScorecard(golferId: string): Scorecard | null {
  const g = data.golfers.find((x) => x.id === golferId);
  if (!g) return null;
  const rounds = g.holes
    .map((strokes, i) => {
      const holes = strokes.map((s, h) => ({ hole: h + 1, par: data.pars[h] ?? null, strokes: s })).filter((h) => h.strokes !== null);
      const sum = holes.reduce((t, h) => t + (h.strokes ?? 0), 0);
      const parSum = holes.reduce((t, h) => t + (h.par ?? 0), 0);
      const d = sum - parSum;
      return { round: i + 1, strokes: holes.length ? sum : null, toPar: holes.length ? (d === 0 ? "E" : d > 0 ? `+${d}` : String(d)) : null, holes };
    })
    .filter((r) => r.holes.length > 0);
  return rounds.length ? { rounds } : null;
}
