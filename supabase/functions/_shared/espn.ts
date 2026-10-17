// ESPN's undocumented site API. Shapes verified against live responses Oct 2026.

export type Sport = "ncaab" | "ncaaf";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const PATH: Record<Sport, string> = {
  ncaab: "basketball/mens-college-basketball",
  ncaaf: "football/college-football",
};
// groups=50 → all D1 basketball; groups=80 → FBS football
const GROUP: Record<Sport, string> = { ncaab: "50", ncaaf: "80" };

const SHORT_CONFERENCE: Record<string, string> = {
  "Atlantic Coast Conference": "ACC",
  "Southeastern Conference": "SEC",
  "Big Ten Conference": "Big Ten",
  "Big 12 Conference": "Big 12",
  "Big East Conference": "Big East",
  "Pac-12 Conference": "Pac-12",
  "American Conference": "American",
  "Atlantic 10 Conference": "A-10",
  "Mountain West Conference": "Mountain West",
  "West Coast Conference": "WCC",
  "Missouri Valley Conference": "MVC",
  "Mid-American Conference": "MAC",
  "Conference USA": "C-USA",
  "Sun Belt Conference": "Sun Belt",
};

export type FeedTeam = {
  espn_id: string;
  name: string;
  short_name: string;
  abbreviation: string;
  logo_url: string | null;
  conference: string | null;
};

export type FeedGame = {
  espn_id: string;
  season: number;
  home_espn_id: string;
  away_espn_id: string;
  start_at: string;
  time_tbd: boolean;
  status: "scheduled" | "in_progress" | "final" | "postponed" | "cancelled";
  home_score: number | null;
  away_score: number | null;
  neutral_site: boolean;
  tv_network: string | null;
  home_rank: number | null;
  away_rank: number | null;
};

async function getJson(url: string) {
  // ESPN rejects Deno's default User-Agent with a 403.
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

/** ESPN team id → conference name, from the groups endpoint (one request). */
export async function fetchConferences(sport: Sport): Promise<Map<string, string>> {
  const data = await getJson(`${BASE}/${PATH[sport]}/groups`);
  const out = new Map<string, string>();
  // deno-lint-ignore no-explicit-any
  const walk = (nodes: any[]) => {
    for (const n of nodes ?? []) {
      if (n.teams?.length && !/division/i.test(n.name)) {
        const conf = SHORT_CONFERENCE[n.name] ?? String(n.name).replace(/ Conference$/, "");
        for (const t of n.teams) out.set(String(t.id), conf);
      }
      if (n.children) walk(n.children);
    }
  };
  walk(data.groups);
  return out;
}

function mapStatus(type: { name?: string; state?: string; completed?: boolean }): FeedGame["status"] {
  const name = type.name ?? "";
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCELED") || name.includes("CANCELLED") || name.includes("FORFEIT")) return "cancelled";
  if (type.completed || type.state === "post") return "final";
  if (type.state === "in" || name.includes("DELAYED") || name.includes("SUSPENDED")) return "in_progress";
  return "scheduled";
}

function rank(r: { current?: number } | undefined) {
  return r?.current && r.current >= 1 && r.current <= 25 ? r.current : null;
}

/** One day's scoreboard. `date` is yyyymmdd (ESPN uses US Eastern dates). */
export async function fetchScoreboard(sport: Sport, date: string, conferences?: Map<string, string>) {
  const data = await getJson(`${BASE}/${PATH[sport]}/scoreboard?dates=${date}&groups=${GROUP[sport]}&limit=500`);
  const teams = new Map<string, FeedTeam>();
  const games: FeedGame[] = [];

  for (const e of data.events ?? []) {
    const c = e.competitions?.[0];
    // deno-lint-ignore no-explicit-any
    const home = c?.competitors?.find((x: any) => x.homeAway === "home");
    // deno-lint-ignore no-explicit-any
    const away = c?.competitors?.find((x: any) => x.homeAway === "away");
    if (!home || !away) continue;

    for (const side of [home, away]) {
      const t = side.team;
      teams.set(String(t.id), {
        espn_id: String(t.id),
        name: t.displayName,
        short_name: t.shortDisplayName ?? t.location ?? t.displayName,
        abbreviation: t.abbreviation,
        logo_url: t.logo ?? null,
        conference: conferences?.get(String(t.id)) ?? null,
      });
    }

    const status = mapStatus(c.status?.type ?? e.status?.type ?? {});
    const started = status === "in_progress" || status === "final";
    // deno-lint-ignore no-explicit-any
    const national = (c.broadcasts ?? []).find((b: any) => b.market === "national") ?? c.broadcasts?.[0];

    games.push({
      espn_id: String(e.id),
      // ESPN labels 2026-27 basketball as 2027; our season is the start year.
      season: sport === "ncaab" ? e.season.year - 1 : e.season.year,
      home_espn_id: String(home.team.id),
      away_espn_id: String(away.team.id),
      start_at: new Date(e.date).toISOString(),
      time_tbd: c.timeValid === false,
      status,
      home_score: started ? Number(home.score) : null,
      away_score: started ? Number(away.score) : null,
      neutral_site: Boolean(c.neutralSite),
      tv_network: national?.names?.join("/") || null,
      home_rank: rank(home.curatedRank),
      away_rank: rank(away.curatedRank),
    });
  }

  return { teams: [...teams.values()], games };
}

/** yyyymmdd in US Eastern for an instant. */
export function espnDate(at: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(at).replaceAll("-", "");
}
