import "server-only";

// Official World Golf Ranking, from the data owgr.com's own ranking page loads. The ranking is
// published each Monday, so it's cached 6 hours. One fetch of the top 300 serves both the
// home page's top 25 and the pick list's ranks. Not a documented API: every field is read
// defensively, and null (the panel says it's unavailable) when the shape isn't recognised.

const URL =
  "https://apiweb.owgr.com/api/owgr/rankings/getRankings?regionId=0&pageSize=300&pageNumber=1&countryId=0&sortString=Rank+ASC";
const REVALIDATE_SECONDS = 6 * 3600;
const FETCH_TIMEOUT_MS = 4000;

export type RankedGolfer = {
  rank: number;
  /** Last week's rank; null when not ranked last week or not given. */
  previous: number | null;
  name: string;
  /** Three-letter country code, when given. */
  country: string | null;
  /** Average points. */
  points: number | null;
};

export type WorldRankings = { asOf: string | null; golfers: RankedGolfer[] };

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

function rowToGolfer(r: Row): RankedGolfer | null {
  const player = (r.player ?? {}) as Row;
  const country = (player.country ?? r.country ?? {}) as Row | string;
  const rank = num(r.rank ?? r.rankPosition);
  const name =
    (typeof player.fullName === "string" && player.fullName) ||
    [player.firstName, player.lastName].filter((x) => typeof x === "string").join(" ") ||
    (typeof r.name === "string" ? r.name : "");
  if (!rank || !name) return null;
  return {
    rank,
    previous: num(r.lastWeekRank ?? r.previousRank ?? r.lastWeekRankPosition),
    name,
    country: typeof country === "string" ? country : typeof country.code3 === "string" ? country.code3 : typeof country.code === "string" ? country.code : null,
    points: num(r.pointsAverage ?? r.averagePoints ?? r.avgPoints),
  };
}

/** "Ludvig Åberg" and "Ludvig Aberg" → "ludvigaberg": how names are matched across sources. */
export function golferKey(name: string) {
  return name
    .replace(/ø/g, "o")
    .replace(/Ø/g, "O")
    .normalize("NFKD")
    .replace(/[^A-Za-z]/g, "")
    .toLowerCase();
}

/** World rank by golferKey(name), for the top 300; empty when the ranking can't be read. */
export async function getWorldRankMap(): Promise<Map<string, number>> {
  const owgr = await getWorldRankings(300);
  return new Map((owgr?.golfers ?? []).map((g) => [golferKey(g.name), g.rank]));
}

export async function getWorldRankings(limit = 25): Promise<WorldRankings | null> {
  try {
    const res = await fetch(URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Row;
    const list = (body.rankingsList ?? body.rankings ?? body.items ?? []) as Row[];
    if (!Array.isArray(list)) return null;
    const golfers = list.map(rowToGolfer).filter((g): g is RankedGolfer => !!g).sort((a, b) => a.rank - b.rank).slice(0, limit);
    if (!golfers.length) return null;
    const asOf = [body.weekEndDate, body.rankingDate, body.lastUpdated, (body.week as Row | undefined)?.weekEndDate].find(
      (d): d is string => typeof d === "string" && !Number.isNaN(Date.parse(d)),
    );
    return { asOf: asOf ?? null, golfers };
  } catch {
    return null;
  }
}
