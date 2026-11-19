/* eslint-disable @typescript-eslint/no-explicit-any -- settings are untyped JSON */
// Major championships pools: settings, building tiers and salaries, and scoring.
// Pure functions (no server or database code) so pages, actions and tests share them.
// The database checks lineups against the same settings (submit_golf_lineup).

export type Major = "masters" | "pga" | "us_open" | "open";
export const MAJORS: { id: Major; name: string; oddsKey: string }[] = [
  { id: "masters", name: "Masters Tournament", oddsKey: "golf_masters_tournament_winner" },
  { id: "pga", name: "PGA Championship", oddsKey: "golf_pga_championship_winner" },
  { id: "us_open", name: "U.S. Open", oddsKey: "golf_us_open_winner" },
  { id: "open", name: "The Open", oddsKey: "golf_the_open_championship_winner" },
];

/** ESPN's tournament ids for each major, by season (from the published schedule). */
export const MAJOR_ESPN_IDS: Record<number, Record<Major, string>> = {
  2026: { masters: "401811941", pga: "401811947", us_open: "401811952", open: "401811957" },
  2027: { masters: "401916383", pga: "401916390", us_open: "401916394", open: "401916399" },
};

/**
 * The golf_odds key for a pool's tournament: the major's Odds API market, or for a regular tour
 * event (major = 'event') "event_<ESPN id>", which the commissioner loads by hand (the Odds API
 * only carries the majors).
 */
export function oddsKeyFor(ev: { major: string | null; espn_id: string }): string | null {
  if (ev.major === "event") return `event_${ev.espn_id}`;
  return MAJORS.find((m) => m.id === ev.major)?.oddsKey ?? null;
}

/** A pool made for one major or one tour event (not a set of majors): "the tournament" in its text. */
export function isSingleTournament(settings: unknown): boolean {
  const scope = ((settings as Record<string, any> | null)?.majors ?? {}).scope;
  return typeof scope === "string" && scope !== "all";
}

/**
 * The purse the commissioner set for a tournament (settings.majors.purses[eventId], dollars), which
 * takes the place of ESPN's; null when none is set.
 */
export function purseOverride(settings: unknown, eventId: string): number | null {
  const purses = (((settings as Record<string, any> | null)?.majors ?? {}) as { purses?: Record<string, unknown> }).purses;
  const n = Number(purses?.[eventId]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type TierSource = "rank" | "odds" | "blend" | "custom";

export type MajorsSettings = {
  contest: "tiers" | "salary";
  /** Cumulative: one season total across the pool's majors. Each: every major stands alone. */
  standings: "cumulative" | "each";
  tiers: {
    count: 4 | 6 | 8;
    /** Golfers to pick from each tier, Tier 1 first. */
    picks: number[];
    /** Golfers in each tier when built from rank or odds (the last tier takes the rest). */
    sizes: number[];
    /** How many of the lineup's golfers count (the best ones). */
    counting: number;
    scoring: "to_par" | "earnings";
    source: TierSource;
    /** Blended tiers: share from world rank (the rest from DraftKings odds), 0–1. Default 20%. */
    rankWeight: number;
  };
  salary: {
    budget: number;
    roster: number;
    /** Share of the salary formula from world rank (the rest from betting odds), 0–1. */
    rankWeight: number;
    min: number;
    max: number;
    source: "blend" | "custom";
  };
};

export function defaultPicks(count: number): number[] {
  return count === 4 ? [2, 2, 2, 2] : count === 8 ? [1, 1, 1, 1, 1, 1, 1, 1] : [1, 1, 1, 1, 1, 3];
}

/** Golfers per tier when built automatically: about five choices per pick, the last tier the rest. */
export function defaultSizes(picks: number[]): number[] {
  return picks.map((p, i) => (i === picks.length - 1 ? 0 : p * 5));
}

export function majorsSettings(settings: unknown): MajorsSettings {
  const m = ((settings as Record<string, unknown> | null)?.majors ?? {}) as Record<string, any>;
  const t = (m.tiers ?? {}) as Record<string, any>;
  const s = (m.salary ?? {}) as Record<string, any>;
  const count = ([4, 6, 8] as const).includes(t.count) ? (t.count as 4 | 6 | 8) : 6;
  const picks = Array.isArray(t.picks) && t.picks.length === count && t.picks.every((n: unknown) => Number.isInteger(n) && (n as number) > 0) ? (t.picks as number[]) : defaultPicks(count);
  const total = picks.reduce((a, b) => a + b, 0);
  const sizes = Array.isArray(t.sizes) && t.sizes.length === count ? (t.sizes as number[]).map((n) => Math.max(0, Math.floor(Number(n) || 0))) : defaultSizes(picks);
  const counting = Number.isInteger(t.counting) && t.counting >= 1 && t.counting <= total ? (t.counting as number) : total;
  return {
    contest: m.contest === "salary" ? "salary" : "tiers",
    standings: m.standings === "each" ? "each" : "cumulative",
    tiers: {
      count,
      picks,
      sizes,
      counting,
      scoring: t.scoring === "earnings" ? "earnings" : "to_par",
      source: (["rank", "odds", "blend", "custom"] as const).includes(t.source) ? t.source : "rank",
      rankWeight: typeof t.rankWeight === "number" && t.rankWeight >= 0 && t.rankWeight <= 1 ? t.rankWeight : 0.2,
    },
    salary: {
      budget: Number.isInteger(s.budget) && s.budget > 0 ? s.budget : 50000,
      roster: Number.isInteger(s.roster) && s.roster > 0 ? s.roster : 8,
      rankWeight: typeof s.rankWeight === "number" && s.rankWeight >= 0 && s.rankWeight <= 1 ? s.rankWeight : 0.5,
      min: Number.isInteger(s.min) && s.min > 0 ? s.min : 4000,
      max: Number.isInteger(s.max) && s.max > 0 ? s.max : 10000,
      source: s.source === "custom" ? "custom" : "blend",
    },
  };
}

export function lineupSize(s: MajorsSettings) {
  return s.contest === "salary" ? s.salary.roster : s.tiers.picks.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------------------------
// Building the field: tiers and salaries

export type FieldGolfer = {
  espn_golfer_id: string;
  golfer_name: string;
  world_rank: number | null;
  /** American odds to win (+450 → 450, −120 → −120). */
  odds: number | null;
  tier: number | null;
  salary: number | null;
};

/** Implied chance to win from American odds. */
export function impliedProbability(odds: number) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

/**
 * Each golfer's strength in the field, 0 (weakest) to 1 (strongest): their percentile by world
 * rank, by odds, or the two blended (rankWeight from rank). A golfer missing one source takes the
 * other; missing both, the bottom. Unranked golfers sit below every ranked one.
 */
export function strengths(field: FieldGolfer[], source: "rank" | "odds" | "blend", rankWeight = 0.5): Map<string, number> {
  const pct = (values: (number | null)[], better: (a: number, b: number) => number) => {
    // Percentile among golfers who have a value: 1 for the best, 0 for the worst.
    const known = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null);
    known.sort((a, b) => better(a.v, b.v));
    const out: (number | null)[] = values.map(() => null);
    const n = known.length;
    known.forEach((x, k) => (out[x.i] = n <= 1 ? 1 : 1 - k / (n - 1)));
    return out;
  };
  const byRank = pct(field.map((g) => g.world_rank), (a, b) => a - b);
  const byOdds = pct(field.map((g) => (g.odds === null ? null : impliedProbability(g.odds))), (a, b) => b - a);
  const w = source === "rank" ? 1 : source === "odds" ? 0 : rankWeight;
  const out = new Map<string, number>();
  field.forEach((g, i) => {
    const r = byRank[i];
    const o = byOdds[i];
    const v = r !== null && o !== null ? w * r + (1 - w) * o : (r ?? o ?? -1);
    out.set(g.espn_golfer_id, v);
  });
  return out;
}

/** Field order, strongest first (ties by world rank, then name). */
export function rankField(field: FieldGolfer[], source: "rank" | "odds" | "blend", rankWeight = 0.5): FieldGolfer[] {
  const s = strengths(field, source, rankWeight);
  return [...field].sort(
    (a, b) =>
      s.get(b.espn_golfer_id)! - s.get(a.espn_golfer_id)! ||
      (a.world_rank ?? 9999) - (b.world_rank ?? 9999) ||
      a.golfer_name.localeCompare(b.golfer_name),
  );
}

/** Assign tiers in strength order: sizes[i] golfers to Tier i+1, the last tier the rest. */
export function buildTiers(field: FieldGolfer[], sizes: number[], source: "rank" | "odds" | "blend", rankWeight = 0.5): FieldGolfer[] {
  const ordered = rankField(field, source, rankWeight);
  let tier = 1;
  let inTier = 0;
  return ordered.map((g) => {
    while (tier < sizes.length && inTier >= sizes[tier - 1]) {
      tier++;
      inTier = 0;
    }
    inTier++;
    return { ...g, tier };
  });
}

/**
 * Salaries from strength on a curve, so only the elite cost the most: min + (max − min) × s^2.2,
 * rounded to $100. With the defaults ($4,000–$10,000) an average golfer costs about $5,900 and
 * eight of them fit a $50,000 budget with room for one or two stars.
 */
export function buildSalaries(field: FieldGolfer[], opts: { min: number; max: number; rankWeight: number }): FieldGolfer[] {
  const s = strengths(field, "blend", opts.rankWeight);
  return field.map((g) => {
    const v = Math.max(0, s.get(g.espn_golfer_id)!);
    const salary = Math.round((opts.min + (opts.max - opts.min) * v ** 2.2) / 100) * 100;
    return { ...g, salary };
  });
}

// ---------------------------------------------------------------------------------------------
// Scoring

export type MajorResult = {
  espn_golfer_id: string;
  pos: string | null;
  to_par: number | null;
  out: boolean;
  thru: number | null;
  earnings: number;
  rounds: (number | null)[] | null;
  scorecard: Scorecard | null;
};
export type Scorecard = { rounds: { round: number; holes: { hole: number; par: number | null; strokes: number | null }[] }[] };

/** "T4" → 4; "1" → 1; anything else null. */
export function placeNumber(pos: string | null) {
  const m = pos?.match(/^T?(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * Score to par for each golfer, with the missed-cut rule: a golfer out of the event (missed
 * cut, withdrew, disqualified) takes the worst score among golfers who made the cut and are
 * still in it. Before anyone's out, golfers keep their own score.
 */
export function toParScores(results: MajorResult[]): Map<string, number | null> {
  const inEvent = results.filter((r) => !r.out && r.to_par !== null).map((r) => r.to_par!);
  const anyOut = results.some((r) => r.out);
  const worst = anyOut && inEvent.length ? Math.max(...inEvent) : null;
  return new Map(results.map((r) => [r.espn_golfer_id, r.out ? (worst ?? r.to_par) : r.to_par]));
}

// DraftKings PGA classic scoring.
export const DFS = {
  doubleEagle: 13,
  eagle: 8,
  birdie: 3,
  par: 0.5,
  bogey: -0.5,
  doubleBogey: -1,
  streak: 3, // 3+ birdies or better in a row, once per round
  bogeyFree: 3, // a full round with nothing over par
  allUnder70: 5, // all four rounds under 70
  holeInOne: 5,
  place: [30, 20, 18, 16, 14, 12, 10, 9, 8, 7] as number[], // 1st–10th
  placeBands: [
    [15, 6],
    [20, 5],
    [25, 4],
    [30, 3],
    [40, 2],
    [50, 1],
  ] as [number, number][],
};

export function finishPoints(place: number | null) {
  if (!place) return 0;
  if (place <= 10) return DFS.place[place - 1];
  for (const [upTo, pts] of DFS.placeBands) if (place <= upTo) return pts;
  return 0;
}

export type FantasyLine = { holes: number; streaks: number; bogeyFree: number; under70: number; holeInOne: number; finish: number; total: number };

/**
 * A golfer's fantasy points from their scorecard: per hole by strokes against par, streak and
 * bogey-free bonuses per round, all four rounds under 70, holes in one, and finishing place
 * points once the event is final (ties all get the tied place's points; nothing for a golfer
 * out of the event).
 */
export function fantasyPoints(result: MajorResult | undefined, eventFinal: boolean): FantasyLine {
  const line: FantasyLine = { holes: 0, streaks: 0, bogeyFree: 0, under70: 0, holeInOne: 0, finish: 0, total: 0 };
  if (!result) return line;
  const rounds = result.scorecard?.rounds ?? [];
  for (const r of rounds) {
    let run = 0;
    let streaked = false;
    let played = 0;
    let overPar = false;
    for (const h of [...r.holes].sort((a, b) => a.hole - b.hole)) {
      if (h.strokes === null || h.par === null) {
        run = 0;
        continue;
      }
      played++;
      const d = h.strokes - h.par;
      line.holes += d <= -3 ? DFS.doubleEagle : d === -2 ? DFS.eagle : d === -1 ? DFS.birdie : d === 0 ? DFS.par : d === 1 ? DFS.bogey : DFS.doubleBogey;
      if (h.strokes === 1) line.holeInOne += DFS.holeInOne;
      if (d > 0) overPar = true;
      run = d < 0 ? run + 1 : 0;
      if (run >= 3 && !streaked) {
        line.streaks += DFS.streak;
        streaked = true;
      }
    }
    if (played === 18 && !overPar) line.bogeyFree += DFS.bogeyFree;
  }
  const strokes = result.rounds ?? [];
  if (strokes.length >= 4 && strokes.slice(0, 4).every((s) => s !== null && s > 0 && s < 70)) line.under70 = DFS.allUnder70;
  if (eventFinal && !result.out) line.finish = finishPoints(placeNumber(result.pos));
  line.total = line.holes + line.streaks + line.bogeyFree + line.under70 + line.holeInOne + line.finish;
  return line;
}

export type GolferScore = { espn_golfer_id: string; value: number | null; counts: boolean };
export type LineupScore = { total: number | null; golfers: GolferScore[] };

/** Lower is better for score to par; higher for earnings and fantasy points. */
export function lowerIsBetter(s: MajorsSettings) {
  return s.contest === "tiers" && s.tiers.scoring === "to_par";
}

/**
 * One lineup's score for one major. Tiers: the best `counting` golfers' scores to par (with the
 * missed-cut rule) or prize money. Salary cap: every golfer's fantasy points.
 */
export function scoreLineup(golferIds: string[], results: MajorResult[], s: MajorsSettings, eventFinal: boolean): LineupScore {
  const byId = new Map(results.map((r) => [r.espn_golfer_id, r]));
  let values: { id: string; v: number | null }[];
  let counting: number;
  if (s.contest === "salary") {
    values = golferIds.map((id) => ({ id, v: byId.has(id) ? fantasyPoints(byId.get(id), eventFinal).total : null }));
    counting = golferIds.length;
  } else if (s.tiers.scoring === "earnings") {
    values = golferIds.map((id) => ({ id, v: byId.has(id) ? byId.get(id)!.earnings : null }));
    counting = s.tiers.counting;
  } else {
    const tp = toParScores(results);
    values = golferIds.map((id) => ({ id, v: tp.get(id) ?? null }));
    counting = s.tiers.counting;
  }
  const low = lowerIsBetter(s);
  const known = values.filter((x) => x.v !== null).sort((a, b) => (low ? a.v! - b.v! : b.v! - a.v!));
  const best = new Set(known.slice(0, counting).map((x) => x.id));
  const total = known.length ? known.slice(0, counting).reduce((t, x) => t + x.v!, 0) : null;
  return { total, golfers: values.map((x) => ({ espn_golfer_id: x.id, value: x.v, counts: best.has(x.id) })) };
}

export type MajorStanding = { user_id: string; total: number | null; byEvent: Map<string, number | null>; rank: number };

/**
 * Standings across the given majors. An entry without a lineup for a major that has started
 * scores that major as the worst entry's score (score to par) or zero (earnings, points).
 */
export function majorStandings(
  users: string[],
  eventIds: string[],
  lineupScore: (userId: string, eventId: string) => number | null | undefined,
  s: MajorsSettings,
): MajorStanding[] {
  const low = lowerIsBetter(s);
  const rows = users.map((u) => ({ user_id: u, byEvent: new Map<string, number | null>(), total: null as number | null, rank: 0 }));
  for (const ev of eventIds) {
    const scores = rows.map((r) => lineupScore(r.user_id, ev));
    const known = scores.filter((v): v is number => typeof v === "number");
    if (!known.length) continue;
    const missing = low ? Math.max(...known) : 0;
    rows.forEach((r, i) => {
      const v = typeof scores[i] === "number" ? (scores[i] as number) : missing;
      r.byEvent.set(ev, v);
      r.total = (r.total ?? 0) + v;
    });
  }
  rows.sort((a, b) => (a.total === null ? 1 : b.total === null ? -1 : low ? a.total - b.total : b.total - a.total));
  let prev: number | null | undefined;
  rows.forEach((r, i) => {
    r.rank = i > 0 && r.total === prev ? rows[i - 1].rank : i + 1;
    prev = r.total;
  });
  return rows;
}

export function formatToPar(n: number | null) {
  return n === null ? "–" : n === 0 ? "E" : n > 0 ? `+${n}` : `−${-n}`;
}

// ---------------------------------------------------------------------------------------------
// Projected prize money while a major is being played

/**
 * The PGA Tour's usual share of the purse for each finishing place, 1st–65th (percent). The
 * majors set their own tables, close to this; it's used only to project prize money before the
 * real amounts are posted. Tied golfers split the shares of the places they cover.
 */
export const PAYOUT_PCT = [
  18, 10.9, 6.9, 4.9, 4.1, 3.625, 3.375, 3.125, 2.925, 2.725, 2.525, 2.325, 2.125, 1.925, 1.825, 1.725, 1.625, 1.525, 1.425, 1.325, 1.225, 1.125,
  1.045, 0.965, 0.885, 0.805, 0.775, 0.745, 0.715, 0.685, 0.655, 0.625, 0.595, 0.57, 0.545, 0.52, 0.495, 0.475, 0.455, 0.435, 0.415, 0.395, 0.375,
  0.355, 0.335, 0.315, 0.295, 0.279, 0.265, 0.257, 0.251, 0.245, 0.241, 0.237, 0.235, 0.233, 0.231, 0.229, 0.227, 0.225, 0.223, 0.221, 0.219, 0.217,
  0.215,
];

/**
 * Prize money per golfer: the real amounts once the major is final; until then a projection
 * from where each golfer stands now (ties split), given the purse. A golfer out of the event, or
 * beyond the paid places, projects $0. Without a purse, everyone projects $0.
 */
export function projectedEarnings(results: MajorResult[], purse: number | null, final: boolean): Map<string, number> {
  if (final || !purse) return new Map(results.map((r) => [r.espn_golfer_id, final ? r.earnings : 0]));
  const byPlace = new Map<number, string[]>();
  for (const r of results) {
    const p = r.out ? null : placeNumber(r.pos);
    if (p) byPlace.set(p, [...(byPlace.get(p) ?? []), r.espn_golfer_id]);
  }
  const out = new Map<string, number>(results.map((r) => [r.espn_golfer_id, 0]));
  for (const [place, ids] of byPlace) {
    const shares = PAYOUT_PCT.slice(place - 1, place - 1 + ids.length);
    const each = (shares.reduce((a, b) => a + b, 0) / ids.length / 100) * purse;
    for (const id of ids) out.set(id, Math.round(each));
  }
  return out;
}

/** Results with prize money replaced by the projection (live) or kept (final). */
export function withProjectedEarnings(results: MajorResult[], purse: number | null, final: boolean): MajorResult[] {
  if (final) return results;
  const money = projectedEarnings(results, purse, false);
  return results.map((r) => ({ ...r, earnings: money.get(r.espn_golfer_id) ?? 0 }));
}

/**
 * What to show beside a golfer: fantasy points (salary cap); prize money once a money pool's
 * major is final; otherwise score to par (with the missed-cut rule).
 */
export type GolferShown = { kind: "points" | "money" | "toPar"; value: number | null };
export function golferShown(id: string, results: MajorResult[], s: MajorsSettings, final: boolean): GolferShown {
  const r = results.find((x) => x.espn_golfer_id === id);
  if (s.contest === "salary") return { kind: "points", value: r ? fantasyPoints(r, final).total : null };
  if (s.tiers.scoring === "earnings" && final) return { kind: "money", value: r ? r.earnings : null };
  return { kind: "toPar", value: toParScores(results).get(id) ?? null };
}

export function formatShown(s: GolferShown) {
  if (s.value === null) return "–";
  if (s.kind === "points") return (Math.round(s.value * 10) / 10).toFixed(1).replace(/\.0$/, "");
  if (s.kind === "money") return `$${Math.round(s.value).toLocaleString("en-US")}`;
  return formatToPar(s.value);
}
