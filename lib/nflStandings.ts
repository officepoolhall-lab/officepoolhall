import "server-only";

// NFL division standings from ESPN's undocumented standings API, for the Home page where the
// college pools show the AP poll. Cached for an hour like the poll. The feed nests groups
// (league → conference → division) with each leaf group's teams under standings.entries; this
// walks whatever nesting comes back, so it still shows something (conferences) if ESPN
// returns no division level.

const REVALIDATE_SECONDS = 3600;

export type NflTeamStanding = {
  espnId: string | null;
  name: string;
  abbreviation: string;
  logo: string | null;
  wins: number;
  losses: number;
  ties: number;
  pct: number;
  /** "W3" / "L1", when ESPN has it. */
  streak: string | null;
};
export type NflGroup = { name: string; shortName: string; teams: NflTeamStanding[] };
export type NflStandings = { conferences: { name: string; shortName: string; divisions: NflGroup[] }[] };

type EspnStat = { name?: string; type?: string; value?: number; displayValue?: string };
type EspnEntry = {
  team?: { id?: string | number; displayName?: string; shortDisplayName?: string; name?: string; abbreviation?: string; logos?: { href?: string }[] };
  stats?: EspnStat[];
};
type EspnGroup = { name?: string; abbreviation?: string; shortName?: string; children?: EspnGroup[]; standings?: { entries?: EspnEntry[] } };

const URLS = [
  "https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings?level=3",
  "https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3",
  "https://site.api.espn.com/apis/v2/sports/football/nfl/standings",
];

/** AFC and NFC, each with its divisions (best record first); null if ESPN is unreachable. */
export async function getNflStandings(): Promise<NflStandings | null> {
  for (const url of URLS) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
        next: { revalidate: REVALIDATE_SECONDS },
        // A slow ESPN answer shouldn't hold the page; the box just doesn't show this time.
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;
      const parsed = parse((await res.json()) as EspnGroup);
      if (parsed) return parsed;
    } catch {
      // Try the next address.
    }
  }
  return null;
}

function parse(root: EspnGroup): NflStandings | null {
  const conferences = (root.children ?? []).map((conf) => {
    // Divisions under the conference, else the conference itself as one group.
    const leaves = conf.children?.length ? conf.children : [conf];
    return {
      name: conf.name ?? "",
      shortName: conf.abbreviation ?? conf.shortName ?? conf.name ?? "",
      divisions: leaves.map(group).filter((g) => g.teams.length > 0),
    };
  });
  const usable = conferences.filter((c) => c.divisions.length > 0);
  return usable.length ? { conferences: usable } : null;
}

function group(g: EspnGroup): NflGroup {
  const teams = (g.standings?.entries ?? []).map(team);
  // Best record first; ESPN's own order (its tiebreakers) breaks ties.
  const order = new Map(teams.map((t, i) => [t, i]));
  teams.sort((a, b) => b.pct - a.pct || b.wins - a.wins || order.get(a)! - order.get(b)!);
  const name = g.name ?? "";
  return { name, shortName: g.abbreviation ?? g.shortName ?? name, teams };
}

function team(e: EspnEntry): NflTeamStanding {
  const stat = (n: string) => e.stats?.find((s) => s.name === n || s.type === n);
  const num = (n: string) => Number(stat(n)?.value ?? 0) || 0;
  const wins = num("wins");
  const losses = num("losses");
  const ties = num("ties");
  const games = wins + losses + ties;
  const pct = stat("winPercent")?.value ?? (games ? (wins + ties / 2) / games : 0);
  return {
    espnId: e.team?.id != null ? String(e.team.id) : null,
    name: e.team?.shortDisplayName ?? e.team?.name ?? e.team?.displayName ?? "—",
    abbreviation: e.team?.abbreviation ?? "",
    logo: e.team?.logos?.[0]?.href ?? null,
    wins,
    losses,
    ties,
    pct: Number(pct) || 0,
    streak: stat("streak")?.displayValue ?? null,
  };
}
