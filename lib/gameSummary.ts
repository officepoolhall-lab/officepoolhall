import "server-only";
import { ESPN_PATH, isFootball, type TeamSport } from "./sports";
import { basketballOrder, reorder } from "./statOrder";

// One game's play-by-play and box score from ESPN's game summary
// (site/v2/sports/{sport}/summary?event={id}). The shape is ESPN's, undocumented, so every
// field is read defensively: anything missing just doesn't show.


export type SummaryTeam = { id: string; abbreviation: string; name: string; logo: string | null; score: string | null; linescores: string[]; homeAway: "home" | "away" };
export type Play = { id: string; text: string; clock: string | null; period: number | null; scoring: boolean; homeScore: number | null; awayScore: number | null; down: string | null; type: string | null; teamId: string | null };
export type Drive = {
  id: string;
  teamId: string | null;
  description: string | null;
  result: string | null;
  plays: Play[];
  /** The score when the drive ended (or now, for the drive under way). */
  awayScore: number | null;
  homeScore: number | null;
};
export type StatGroup = { name: string; labels: string[]; rows: { id: string | null; name: string; stats: string[]; starter: boolean }[]; totals: string[] | null };
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

export async function getGameSummary(sport: TeamSport, espnId: string, live: boolean): Promise<GameSummary | null> {
  let data: any;
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/summary?event=${encodeURIComponent(espnId)}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      // Not final yet: always fresh from ESPN. (A timed cache hands the first viewer after it
      // expires the old copy, which could be from before kickoff, while it refetches.)
      // Finished games barely change: cached 10 minutes.
      ...(live ? { cache: "no-store" as const } : { next: { revalidate: 600 } }),
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
  const drive = (d: any): Drive => {
    const plays = [...(d?.plays ?? [])].map(play).reverse();
    // The newest play that carries a score is where the drive left the score.
    const scored = plays.find((p) => p.awayScore !== null && p.homeScore !== null);
    return {
      id: String(d?.id ?? Math.random()),
      teamId: str(d?.team?.id),
      description: str(d?.description),
      result: str(d?.displayResult) ?? str(d?.result),
      plays,
      awayScore: scored?.awayScore ?? null,
      homeScore: scored?.homeScore ?? null,
    };
  };
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
          .map((a: any) => ({
            // ESPN's player id: the box score's names open the player's game log.
            id: str(a?.athlete?.id),
            // Basketball: ESPN marks the starting five.
            starter: a?.starter === true,
            name: str(a?.athlete?.shortName) ?? str(a?.athlete?.displayName) ?? "",
            stats: (a?.stats ?? []).map((v: any) => String(v)),
          }))
          .filter((r: { name: string; stats: string[] }) => r.name && r.stats.length),
        totals: Array.isArray(g?.totals) && g.totals.length ? g.totals.map((v: any) => String(v)) : null,
      }))
      .filter((g: StatGroup) => g.rows.length)
      // Basketball: minutes, points, rebounds, assists, turnovers, steals, blocks, shooting, fouls.
      .map((g: StatGroup): StatGroup => {
        if (sport !== "ncaab") return g;
        const p = withPercentages(g);
        const order = basketballOrder(p.labels);
        return {
          ...p,
          labels: reorder(p.labels, order)!,
          rows: p.rows.map((r) => ({ ...r, stats: reorder(r.stats, order)! })),
          totals: reorder(p.totals, order),
        };
      }),
  }));

  const football = isFootball(sport);
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

/**
 * Basketball box scores give shooting as made-attempted ("5-11"): adds FG%, 3P% and FT% columns
 * worked out from them ("45.5"; "—" with no attempts), so the box score matches the game log.
 */
function withPercentages(g: StatGroup): StatGroup {
  const shots: [string, string][] = [["FG", "FG%"], ["3PT", "3P%"], ["FT", "FT%"]];
  const add = shots.filter(([from, pct]) => g.labels.includes(from) && !g.labels.includes(pct));
  if (!add.length) return g;
  const pct = (v: string | undefined) => {
    const m = v?.match(/^(\d+)-(\d+)$/);
    return m && Number(m[2]) > 0 ? ((Number(m[1]) / Number(m[2])) * 100).toFixed(1) : "—";
  };
  const extend = (values: string[]) => [...values, ...add.map(([from]) => pct(values[g.labels.indexOf(from)]))];
  return {
    ...g,
    labels: [...g.labels, ...add.map(([, p]) => p)],
    rows: g.rows.map((r) => ({ ...r, stats: extend(r.stats) })),
    totals: g.totals ? extend(g.totals) : null,
  };
}
