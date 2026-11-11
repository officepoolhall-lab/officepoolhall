import "server-only";
import { DEMO_COURSE_PAR, DEMO_LIVE_ID, getDemoScorecard } from "./golfDemo";

// One golfer's hole-by-hole scores for a tournament, from ESPN's core API:
// events/{id}/competitions/{id}/competitors/{golfer}/linescores → one item per round, each
// with a linescores list of holes. Confirmed Nov 2026 (2025 Masters): rounds carry period,
// value (strokes), displayValue (to par); holes carry period (hole), value (strokes), par.
// Rounds not yet played have no value or holes and are left out; a round under way is filled
// out to 18 holes (pars from other rounds or the course, no score yet).

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

/**
 * Every round as a full 18 holes: holes not played yet get their par and no score. Pars come
 * from any round's holes, else from `coursePars` (hole number → par).
 */
export function fillRounds(card: Scorecard, coursePars: Map<number, number> = new Map()): Scorecard {
  const par = new Map(coursePars);
  for (const r of card.rounds) for (const h of r.holes) if (h.par !== null) par.set(h.hole, h.par);
  return {
    rounds: card.rounds.map((r) => {
      const byHole = new Map(r.holes.map((h) => [h.hole, h]));
      return { ...r, holes: Array.from({ length: 18 }, (_, i) => byHole.get(i + 1) ?? { hole: i + 1, par: par.get(i + 1) ?? null, strokes: null }) };
    }),
  };
}

/** The course's total par (72, say), for working out a live round's score; null if unknown. */
export async function getCoursePar(tournamentId: string): Promise<number | null> {
  if (tournamentId === DEMO_LIVE_ID) return DEMO_COURSE_PAR;
  if (!/^\d+$/.test(tournamentId)) return null;
  const pars = await coursePars(tournamentId);
  return pars.size === 18 ? [...pars.values()].reduce((t, p) => t + p, 0) : null;
}

/** The course's par for each hole (cached a day); empty when ESPN doesn't give it. */
async function coursePars(tournamentId: string): Promise<Map<number, number>> {
  try {
    const res = await fetch(`https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${tournamentId}?lang=en&region=us`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return new Map();
    const body = (await res.json()) as { courses?: { holes?: { number?: unknown; shotsToPar?: unknown }[] }[] };
    return new Map(
      (body.courses?.[0]?.holes ?? [])
        .map((h) => [num(h.number), num(h.shotsToPar)] as const)
        .filter((x): x is readonly [number, number] => x[0] !== null && x[1] !== null)
        .map(([n, p]) => [n, p] as [number, number]),
    );
  } catch {
    return new Map();
  }
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
    const card = parseScorecard(await res.json());
    if (!card) return null;
    // A round under way lists only the holes played; fill the rest with their pars. The course
    // is only asked for when no round has given every hole's par yet (round 1 under way).
    const known = new Set(card.rounds.flatMap((r) => r.holes.filter((h) => h.par !== null).map((h) => h.hole)));
    return fillRounds(card, known.size < 18 ? await coursePars(tournamentId) : new Map());
  } catch {
    return null;
  }
}
