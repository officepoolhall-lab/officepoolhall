import "server-only";
import { ESPN_PATH, type TeamSport } from "./sports";

// The AP Top 25 from ESPN's undocumented site API (same source as the schedule and scores;
// shape checked Oct 2026). Once the College Football Playoff committee publishes its
// rankings (from early November), ESPN adds them to the same feed and they take over.
// Cached for an hour, so a new poll or CFP release shows up within the hour, no job or table.
// Each team's record is its current one (ESPN's team page, 15 minutes), not the record at release.

const REVALIDATE_SECONDS = 3600;

export type PollTeam = {
  rank: number;
  /** ESPN's team id (matches teams.espn_id). */
  espnId: string | null;
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
  team?: { id?: string | number; nickname?: string; location?: string; name?: string; abbreviation?: string; logo?: string; logos?: { href?: string }[] };
};
type EspnRanking = { type?: string; name?: string; shortName?: string; date?: string; occurrence?: { displayValue?: string }; ranks?: EspnRank[] };

/** CFP rankings when out (football), else the latest AP poll; null if ESPN is unreachable or has none yet. */
/**
 * `currentRecords`: replace each team's record at release with its record now (25 more ESPN
 * calls). Only Home's poll list wants that; the ranks used beside team names don't.
 */
export async function getApPoll(sport: TeamSport, { currentRecords = false }: { currentRecords?: boolean } = {}): Promise<ApPoll | null> {
  // The NFL has no poll.
  if (sport === "nfl") return null;
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/rankings`, {
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
        espnId: r.team?.id != null ? String(r.team.id) : null,
        previous: r.previous && r.previous > 0 ? r.previous : null,
        name: r.team?.nickname ?? r.team?.location ?? r.team?.name ?? "—",
        abbreviation: r.team?.abbreviation ?? "",
        logo: r.team?.logo ?? r.team?.logos?.[0]?.href ?? null,
        record: r.recordSummary ?? null,
        firstPlaceVotes: r.firstPlaceVotes ?? 0,
      }))
      .sort((a, b) => a.rank - b.rank);

    // Records as of now, not as of the poll's release: each team's current overall record.
    const current = currentRecords
      ? await Promise.all(teams.map((t) => (t.espnId ? currentRecord(sport, t.espnId) : Promise.resolve(null))))
      : [];
    teams.forEach((t, i) => {
      if (current[i]) t.record = current[i];
    });

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

/** A team's overall record right now ("10-1"), from ESPN's team page (cached 15 minutes); null if unavailable. */
async function currentRecord(sport: TeamSport, espnId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/teams/${encodeURIComponent(espnId)}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { team?: { record?: { items?: { type?: string; summary?: string }[] } } };
    const items = body.team?.record?.items ?? [];
    return (items.find((x) => x.type === "total") ?? items[0])?.summary ?? null;
  } catch {
    return null;
  }
}
