import "server-only";

// The AP Top 25 from ESPN's undocumented site API (same source as the schedule and scores;
// shape checked Oct 2026). Once the College Football Playoff committee publishes its
// rankings (from early November), ESPN adds them to the same feed and they take over.
// Cached for an hour, so a new poll or CFP release shows up within the hour, no job or table.

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
export type ApPoll = {
  /** "CFP Rankings" once the committee has released them, else "AP Top 25". */
  title: string;
  cfp: boolean;
  label: string;
  date: string | null;
  teams: PollTeam[];
};

type EspnRank = {
  current?: number;
  previous?: number;
  firstPlaceVotes?: number;
  recordSummary?: string;
  team?: { nickname?: string; location?: string; name?: string; abbreviation?: string; logo?: string; logos?: { href?: string }[] };
};
type EspnRanking = { type?: string; name?: string; shortName?: string; date?: string; occurrence?: { displayValue?: string }; ranks?: EspnRank[] };

/** CFP rankings when out (football), else the latest AP poll; null if ESPN is unreachable or has none yet. */
export async function getApPoll(sport: "ncaaf" | "ncaab"): Promise<ApPoll | null> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}/rankings`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: REVALIDATE_SECONDS },
      // A slow ESPN answer shouldn't hold the page; the list just doesn't show this time.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { rankings?: EspnRanking[] };
    const rankings = body.rankings ?? [];
    const hasRanks = (r: EspnRanking) => Boolean(r.ranks?.some((x) => (x.current ?? 0) > 0));
    const cfp =
      sport === "ncaaf"
        ? rankings.find((r) => hasRanks(r) && (r.type === "cfp" || /playoff|\bcfp\b/i.test(`${r.name ?? ""} ${r.shortName ?? ""}`)))
        : undefined;
    const ap = cfp ?? rankings.find((r) => r.type === "ap" && hasRanks(r)) ?? rankings.find((r) => /\bAP\b/.test(r.name ?? "") && hasRanks(r));
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

    return {
      title: cfp ? "CFP Rankings" : "AP Top 25",
      cfp: Boolean(cfp),
      label: ap.occurrence?.displayValue ?? ap.shortName ?? "Latest",
      date: ap.date ?? null,
      teams,
    };
  } catch {
    return null;
  }
}
