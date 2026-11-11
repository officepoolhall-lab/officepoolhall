import "server-only";
import { DEMO_LIVE_ID, getDemoScorecard } from "./golfDemo";

// One golfer's hole-by-hole scores for a tournament, from ESPN's core API:
// events/{id}/competitions/{id}/competitors/{golfer}/linescores → one item per round, each
// with a linescores list of holes. Confirmed Nov 2026 (2025 Masters): rounds carry period,
// value (strokes), displayValue (to par); holes carry period (hole), value (strokes), par.
// Rounds not yet played have no value or holes and are left out.

const FETCH_TIMEOUT_MS = 6000;

export type ScorecardHole = { hole: number; par: number | null; strokes: number | null };
export type ScorecardRound = { round: number; strokes: number | null; toPar: string | null; holes: ScorecardHole[] };
export type Scorecard = { rounds: ScorecardRound[] };

type Obj = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);

function parseHole(h: Obj, i: number): ScorecardHole {
  const strokes = num(h.value ?? h.strokes ?? h.score);
  const par = num(h.par ?? (h.hole as Obj | undefined)?.par ?? (h.scoreType as Obj | undefined)?.par);
  return { hole: num(h.period ?? h.number ?? h.hole) ?? i + 1, par, strokes: strokes && strokes > 0 ? strokes : null };
}

export function parseScorecard(body: unknown): Scorecard | null {
  const items = ((body as Obj)?.items ?? (body as Obj)?.linescores) as Obj[] | undefined;
  if (!Array.isArray(items)) return null;
  const rounds = items
    .map((r, i): ScorecardRound => {
      const holes = Array.isArray(r.linescores) ? (r.linescores as Obj[]).map(parseHole).sort((a, b) => a.hole - b.hole) : [];
      const strokes = num(r.value);
      return {
        round: num(r.period) ?? i + 1,
        strokes: strokes && strokes > 0 ? strokes : holes.some((h) => h.strokes) ? holes.reduce((s, h) => s + (h.strokes ?? 0), 0) : null,
        toPar: typeof r.displayValue === "string" && /^([+-]\d+|E)$/.test(r.displayValue) ? r.displayValue : null,
        holes,
      };
    })
    .filter((r) => r.holes.length > 0 || r.strokes !== null)
    .sort((a, b) => a.round - b.round);
  return rounds.length ? { rounds } : null;
}

/** Cached `revalidate` seconds (a minute while live; final rounds don't change). */
export async function getScorecard(tournamentId: string, golferId: string, revalidate: number): Promise<Scorecard | null> {
  if (tournamentId === DEMO_LIVE_ID) return getDemoScorecard(golferId);
  if (!/^\d+$/.test(tournamentId) || !/^\d+$/.test(golferId)) return null;
  try {
    const res = await fetch(
      `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${tournamentId}/competitions/${tournamentId}/competitors/${golferId}/linescores?lang=en&region=us`,
      { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" }, next: { revalidate }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    return parseScorecard(await res.json());
  } catch {
    return null;
  }
}
