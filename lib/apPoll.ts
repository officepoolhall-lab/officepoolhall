import "server-only";

// The AP Top 25 from ESPN's undocumented site API (same source as the schedule and scores;
// shape checked Oct 2026). Cached for an hour, so a new poll (AP releases Sundays) shows
// up within the hour without any job or table.

const PATH = { ncaaf: "football/college-football", ncaab: "basketball/mens-college-basketball" } as const;
const REVALIDATE_SECONDS = 3600;

export type PollTeam = {
  rank: number;
  /** Last week's rank; null when the team was unranked. */
  previous: number | null;
  name: string;
  abbreviation: string;
  logo: string | null;
  record: string | null;
  firstPlaceVotes: number;
};
export type ApPoll = { label: string; date: string | null; teams: PollTeam[] };

type EspnRank = {
  current?: number;
  previous?: number;
  firstPlaceVotes?: number;
  recordSummary?: string;
  team?: { nickname?: string; location?: string; name?: string; abbreviation?: string; logo?: string; logos?: { href?: string }[] };
};
type EspnRanking = { type?: string; name?: string; shortName?: string; date?: string; occurrence?: { displayValue?: string }; ranks?: EspnRank[] };

/** The latest AP poll for the sport, or null if ESPN is unreachable or has none yet. */
export async function getApPoll(sport: "ncaaf" | "ncaab"): Promise<ApPoll | null> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}/rankings`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { rankings?: EspnRanking[] };
    const ap = body.rankings?.find((r) => r.type === "ap") ?? body.rankings?.find((r) => /\bAP\b/.test(r.name ?? ""));
    if (!ap?.ranks?.length) return null;

    const teams = ap.ranks
      .filter((r): r is EspnRank & { current: number } => typeof r.current === "number" && r.current > 0)
      .map((r) => ({
        rank: r.current,
        previous: r.previous && r.previous > 0 ? r.previous : null,
        name: r.team?.nickname ?? r.team?.location ?? r.team?.name ?? "—",
        abbreviation: r.team?.abbreviation ?? "",
        logo: r.team?.logo ?? r.team?.logos?.[0]?.href ?? null,
        record: r.recordSummary ?? null,
        firstPlaceVotes: r.firstPlaceVotes ?? 0,
      }))
      .sort((a, b) => a.rank - b.rank);

    return { label: ap.occurrence?.displayValue ?? ap.shortName ?? "Latest", date: ap.date ?? null, teams };
  } catch {
    return null;
  }
}
