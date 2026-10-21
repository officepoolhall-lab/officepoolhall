import "server-only";

// One game's play-by-play and box score from ESPN's game summary
// (site/v2/sports/{sport}/summary?event={id}). The shape is ESPN's, undocumented, so every
// field is read defensively: anything missing just doesn't show.

const PATH = { ncaaf: "football/college-football", ncaab: "basketball/mens-college-basketball" } as const;

export type SummaryTeam = { id: string; abbreviation: string; name: string; logo: string | null; score: string | null; linescores: string[]; homeAway: "home" | "away" };
export type Play = { id: string; text: string; clock: string | null; period: number | null; scoring: boolean; homeScore: number | null; awayScore: number | null; down: string | null; type: string | null; teamId: string | null };
export type Drive = { id: string; teamId: string | null; description: string | null; result: string | null; plays: Play[] };
export type StatGroup = { name: string; labels: string[]; rows: { name: string; stats: string[] }[]; totals: string[] | null };
export type TeamStat = { label: string; away: string; home: string };

export type GameSummary = {
  status: { detail: string | null; state: "pre" | "in" | "post" | null };
  away: SummaryTeam | null;
  home: SummaryTeam | null;
  /** Football: drives, newest first (the one under way first). */
  drives: Drive[];
  /** Basketball (or football without drives): plays, newest first. */
  plays: Play[];
  teamStats: TeamStat[];
  /** Player stats per team: passing, rushing, receiving… or one basketball table. */
  players: { teamId: string; abbreviation: string; groups: StatGroup[] }[];
  periodLabel: (n: number) => string;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's JSON is untyped */
const str = (v: any): string | null => (v == null || v === "" ? null : String(v));
const num = (v: any): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function play(p: any): Play {
  return {
    id: String(p?.id ?? Math.random()),
    text: str(p?.text) ?? str(p?.type?.text) ?? "",
    clock: str(p?.clock?.displayValue),
    period: num(p?.period?.number),
    scoring: Boolean(p?.scoringPlay),
    homeScore: num(p?.homeScore),
    awayScore: num(p?.awayScore),
    down: str(p?.start?.downDistanceText),
    type: str(p?.type?.text),
    teamId: str(p?.team?.id),
  };
}

export async function getGameSummary(sport: "ncaaf" | "ncaab", espnId: string, live: boolean): Promise<GameSummary | null> {
  let data: any;
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}/summary?event=${encodeURIComponent(espnId)}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      // Live games every 15 seconds; finished ones barely change.
      next: { revalidate: live ? 15 : 600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }

  const comp = data?.header?.competitions?.[0];
  const teamOf = (side: "home" | "away"): SummaryTeam | null => {
    const c = (comp?.competitors ?? []).find((x: any) => x?.homeAway === side);
    if (!c) return null;
    return {
      id: String(c.team?.id ?? c.id ?? ""),
      abbreviation: str(c.team?.abbreviation) ?? str(c.team?.shortDisplayName) ?? "",
      name: str(c.team?.shortDisplayName) ?? str(c.team?.displayName) ?? "",
      logo: str(c.team?.logos?.[0]?.href) ?? str(c.team?.logo),
      score: str(c.score),
      linescores: (c.linescores ?? []).map((l: any) => str(l?.displayValue) ?? str(l?.value) ?? ""),
      homeAway: side,
    };
  };
  const away = teamOf("away");
  const home = teamOf("home");
  const state = comp?.status?.type?.state;

  // Football drives: the current one first, then the rest newest first; plays newest first.
  const drive = (d: any): Drive => ({
    id: String(d?.id ?? Math.random()),
    teamId: str(d?.team?.id),
    description: str(d?.description),
    result: str(d?.displayResult) ?? str(d?.result),
    plays: [...(d?.plays ?? [])].map(play).reverse(),
  });
  const previous: Drive[] = (data?.drives?.previous ?? []).map(drive);
  const current = data?.drives?.current ? drive(data.drives.current) : null;
  const drives = [...(current && !previous.some((d) => d.id === current.id) ? [current] : []), ...previous.reverse()];

  // Basketball plays (also football when ESPN gives no drives).
  const plays: Play[] = [...(data?.plays ?? [])].map(play).reverse();

  // Team stats as label · away · home.
  const teamsBox: any[] = data?.boxscore?.teams ?? [];
  const awayBox = teamsBox.find((t) => t?.homeAway === "away" || String(t?.team?.id) === away?.id);
  const homeBox = teamsBox.find((t) => t?.homeAway === "home" || String(t?.team?.id) === home?.id);
  const teamStats: TeamStat[] = (homeBox?.statistics ?? awayBox?.statistics ?? [])
    .map((s: any) => {
      const key = s?.name;
      const find = (box: any) => str((box?.statistics ?? []).find((x: any) => x?.name === key)?.displayValue) ?? "—";
      return { label: str(s?.label) ?? str(s?.name) ?? "", away: find(awayBox), home: find(homeBox) };
    })
    .filter((s: TeamStat) => s.label);

  const players = (data?.boxscore?.players ?? []).map((t: any) => ({
    teamId: String(t?.team?.id ?? ""),
    abbreviation: str(t?.team?.abbreviation) ?? "",
    groups: (t?.statistics ?? [])
      .map((g: any): StatGroup => ({
        name: str(g?.text) ?? str(g?.name) ?? "",
        labels: (g?.labels ?? []).map((l: any) => String(l)),
        rows: (g?.athletes ?? [])
          .map((a: any) => ({ name: str(a?.athlete?.shortName) ?? str(a?.athlete?.displayName) ?? "", stats: (a?.stats ?? []).map((v: any) => String(v)) }))
          .filter((r: { name: string; stats: string[] }) => r.name && r.stats.length),
        totals: Array.isArray(g?.totals) && g.totals.length ? g.totals.map((v: any) => String(v)) : null,
      }))
      .filter((g: StatGroup) => g.rows.length),
  }));

  const football = sport === "ncaaf";
  return {
    status: { detail: str(comp?.status?.type?.shortDetail) ?? str(comp?.status?.type?.detail), state: state === "pre" || state === "in" || state === "post" ? state : null },
    away,
    home,
    drives,
    plays,
    teamStats,
    players,
    periodLabel: (n: number) =>
      football ? (n <= 4 ? `Q${n}` : n === 5 ? "OT" : `${n - 4}OT`) : n <= 2 ? (n === 1 ? "1st Half" : "2nd Half") : n === 3 ? "OT" : `${n - 2}OT`,
  };
}
