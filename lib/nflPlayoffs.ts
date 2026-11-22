import "server-only";

// The NFL postseason from ESPN: each round's games (the postseason scoreboard), the Super Bowl,
// and the playoff field (the 14 teams) once the regular season is over. Shapes are ESPN's,
// undocumented, so everything is read defensively: what's missing reads as "not known yet".

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" };

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** ESPN's postseason weeks: Wild Card, Divisional, Conference, (4 is the Pro Bowl,) Super Bowl. */
export const PLAYOFF_ROUNDS = [
  { week: 1, name: "Wild Card", short: "WC" },
  { week: 2, name: "Divisional", short: "DIV" },
  { week: 3, name: "Conference", short: "CONF" },
  { week: 5, name: "Super Bowl", short: "SB" },
] as const;

export type PlayoffTeam = { espnId: string; name: string; fullName: string; abbreviation: string | null; logo: string | null; homeAway: "home" | "away"; score: number; lost: boolean };
export type PlayoffGame = { id: string; /** 0-3: Wild Card to Super Bowl. */ round: number; date: string | null; state: "pre" | "in" | "post"; teams: PlayoffTeam[] };

/** A real team (the bracket's set), not a "TBD" placeholder. */
const real = (t: PlayoffTeam) => /^\d+$/.test(t.espnId) && Number(t.espnId) > 0 && !/^(tbd|afc|nfc)$/i.test(t.name) && !/^(tbd|afc|nfc)$/i.test(t.abbreviation ?? "");

/** The season's playoff games (season = the year it started): one request per round, cached two minutes. Never rejects. */
export async function getPlayoffGames(season: number): Promise<PlayoffGame[]> {
  const rounds = await Promise.all(
    PLAYOFF_ROUNDS.map(async (r, i) => {
      try {
        const res = await fetch(`${ESPN}/scoreboard?seasontype=3&week=${r.week}&dates=${season}`, { headers: HEADERS, next: { revalidate: 120 }, signal: AbortSignal.timeout(5000) });
        if (!res.ok) return [];
        const data = (await res.json()) as Row;
        return ((data?.events ?? []) as Row[]).map((e): PlayoffGame => {
          const comp = e?.competitions?.[0] ?? {};
          const state = comp?.status?.type?.state ?? e?.status?.type?.state;
          const over = state === "post";
          return {
            id: String(e.id),
            round: i,
            date: typeof e?.date === "string" ? e.date : null,
            state: state === "in" || state === "post" ? state : "pre",
            teams: ((comp.competitors ?? []) as Row[]).map((c) => ({
              espnId: String(c?.team?.id ?? ""),
              name: String(c?.team?.shortDisplayName ?? c?.team?.name ?? c?.team?.displayName ?? ""),
              fullName: String(c?.team?.displayName ?? c?.team?.shortDisplayName ?? ""),
              abbreviation: c?.team?.abbreviation ? String(c.team.abbreviation) : null,
              logo: c?.team?.logo ? String(c.team.logo) : null,
              homeAway: c?.homeAway === "home" ? "home" : "away",
              score: Number(c?.score ?? 0) || 0,
              lost: over && c?.winner === false,
            })),
          };
        });
      } catch {
        return [];
      }
    }),
  );
  return rounds.flat();
}

/** The Super Bowl's game on ESPN (teams are placeholders until the conference title games are played), or null. */
export async function getSuperBowl(season: number): Promise<PlayoffGame | null> {
  return (await getPlayoffGames(season)).find((g) => g.round === 3) ?? null;
}

/** The game's two sides once both are real teams. */
export const matchup = (g: PlayoffGame | null) => {
  const home = g?.teams.find((t) => t.homeAway === "home");
  const away = g?.teams.find((t) => t.homeAway === "away");
  return home && away && real(home) && real(away) ? { home, away } : null;
};

/** Each conference's top seed (the two teams with a first-round bye), from ESPN's standings. */
async function topSeeds(season: number): Promise<{ espnId: string; name: string; fullName: string; abbreviation: string | null; logo: string | null }[]> {
  for (const url of [`https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=${season}&seasontype=2`, `https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings?season=${season}&seasontype=2`]) {
    try {
      const res = await fetch(url, { headers: HEADERS, next: { revalidate: 600 }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const out: Awaited<ReturnType<typeof topSeeds>> = [];
      const walk = (g: Row) => {
        for (const e of (g?.standings?.entries ?? []) as Row[]) {
          const seed = ((e?.stats ?? []) as Row[]).find((x) => x?.name === "playoffSeed")?.value;
          if (Number(seed) === 1 && e?.team?.id != null) {
            out.push({
              espnId: String(e.team.id),
              name: String(e.team.shortDisplayName ?? e.team.name ?? e.team.displayName ?? ""),
              fullName: String(e.team.displayName ?? ""),
              abbreviation: e.team.abbreviation ? String(e.team.abbreviation) : null,
              logo: e.team.logos?.[0]?.href ? String(e.team.logos[0].href) : null,
            });
          }
        }
        for (const c of (g?.children ?? []) as Row[]) walk(c);
      };
      walk((await res.json()) as Row);
      if (out.length) return out;
    } catch {
      // Try the next address.
    }
  }
  return [];
}

export type PlayoffField = {
  teams: { espnId: string; name: string; fullName: string; abbreviation: string | null; logo: string | null }[];
  /** The first Wild Card kickoff: when rosters lock. */
  firstKickoff: string | null;
};

/**
 * The playoff field, once it's set: the twelve teams in the six Wild Card games plus each
 * conference's top seed (who sit that round out). Null until ESPN lists all six Wild Card
 * games with real teams, which happens when the regular season ends.
 */
export async function getPlayoffField(season: number): Promise<PlayoffField | null> {
  const wildCard = (await getPlayoffGames(season)).filter((g) => g.round === 0);
  if (wildCard.length < 6 || !wildCard.every((g) => g.teams.length === 2 && g.teams.every(real))) return null;
  const teams = new Map<string, PlayoffField["teams"][number]>();
  for (const g of wildCard) for (const t of g.teams) teams.set(t.espnId, { espnId: t.espnId, name: t.name, fullName: t.fullName, abbreviation: t.abbreviation, logo: t.logo });
  for (const t of await topSeeds(season)) if (!teams.has(t.espnId)) teams.set(t.espnId, t);
  const dates = wildCard.map((g) => g.date).filter((d): d is string => Boolean(d)).sort();
  return { teams: [...teams.values()], firstKickoff: dates[0] ?? null };
}

/** This week's NFL games on ESPN (for choosing a board's game without typing an id). Cached ten minutes; never rejects. */
export async function getThisWeeksGames(): Promise<{ id: string; label: string; date: string | null }[]> {
  try {
    const res = await fetch(`${ESPN}/scoreboard`, { headers: HEADERS, next: { revalidate: 600 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as Row;
    return ((data?.events ?? []) as Row[])
      .map((e) => ({ id: String(e?.id ?? ""), label: String(e?.name ?? e?.shortName ?? ""), date: typeof e?.date === "string" ? e.date : null }))
      .filter((g) => g.id && g.label);
  } catch {
    return [];
  }
}
