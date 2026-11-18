import "server-only";
import { ESPN_PATH, type TeamSport } from "./sports";

// Player and team profiles from ESPN's public APIs, for the box score's player pop-up and My
// Picks' team pop-up. Every field is read defensively: these feeds are undocumented, and a
// missing piece just leaves that part of the pop-up out.

const UA = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" };

async function getJson(url: string, revalidate: number): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: UA, next: { revalidate }, signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const logoOf = (t: any): string | null => str(t?.logo) ?? str(t?.logos?.[0]?.href) ?? null;
/** "football/college-football" → core API path "football/leagues/college-football". */
const corePath = (sport: TeamSport) => ESPN_PATH[sport].replace("/", "/leagues/");

// ---------------------------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------------------------

export type PlayerGame = {
  id: string;
  date: string | null;
  /** "vs" or "@". */
  atVs: string | null;
  opponent: string | null;
  opponentLogo: string | null;
  /** "W" / "L" / "T". */
  result: string | null;
  score: string | null;
  stats: string[];
};
export type PlayerTable = { name: string; labels: string[]; games: PlayerGame[]; totals: string[] | null; averages: string[] | null };
export type PlayerProfile = {
  name: string;
  position: string | null;
  jersey: string | null;
  team: string | null;
  teamLogo: string | null;
  headshot: string | null;
  /** This season's game log (one table; football's can have more than one category). */
  tables: PlayerTable[];
  season: string | null;
};

/** A player's bio line and this season's game log with totals; null if ESPN has nothing. */
export async function getPlayerProfile(sport: TeamSport, athleteId: string): Promise<PlayerProfile | null> {
  const base = `https://site.web.api.espn.com/apis/common/v3/sports/${ESPN_PATH[sport]}/athletes/${encodeURIComponent(athleteId)}`;
  // Game logs change after each game: 10 minutes. The bio barely changes: a day.
  const [bio, log] = await Promise.all([getJson(base, 86400), getJson(`${base}/gamelog`, 600)]);
  const a = bio?.athlete ?? bio;
  const name = str(a?.displayName) ?? str(a?.fullName);
  if (!name && !log) return null;

  const labels: string[] = Array.isArray(log?.labels) ? log.labels.map(String) : [];
  const events: Record<string, any> = log?.events && typeof log.events === "object" ? log.events : {};
  const seasonType = Array.isArray(log?.seasonTypes) ? log.seasonTypes[0] : null;
  const tables: PlayerTable[] = [];
  const games: PlayerGame[] = [];
  let totals: string[] | null = null;
  for (const cat of Array.isArray(seasonType?.categories) ? seasonType.categories : []) {
    if (cat?.type === "total" || /total/i.test(str(cat?.displayName) ?? "")) {
      if (Array.isArray(cat?.totals)) totals = cat.totals.map(String);
      continue;
    }
    for (const e of Array.isArray(cat?.events) ? cat.events : []) {
      const id = str(e?.eventId);
      if (!id) continue;
      const ev = events[id] ?? {};
      games.push({
        id,
        date: str(ev?.gameDate),
        atVs: str(ev?.atVs),
        opponent: str(ev?.opponent?.abbreviation) ?? str(ev?.opponent?.displayName),
        opponentLogo: logoOf(ev?.opponent),
        result: str(ev?.gameResult),
        score: str(ev?.score),
        stats: Array.isArray(e?.stats) ? e.stats.map(String) : [],
      });
    }
  }
  // Newest game first.
  games.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""));
  if (!totals && Array.isArray(seasonType?.summary?.stats?.[0]?.stats)) totals = seasonType.summary.stats[0].stats.map(String);
  if (labels.length && games.length) {
    // Basketball: per-game averages over the games in the log.
    const averages = sport === "ncaab" ? perGame(labels, games.map((g) => g.stats), totals) : null;
    tables.push({ name: str(seasonType?.displayName) ?? "This season", labels, games, totals, averages });
  }

  return {
    name: name ?? "Player",
    position: str(a?.position?.abbreviation) ?? str(a?.position?.displayName),
    jersey: str(a?.jersey),
    team: str(a?.team?.displayName) ?? str(a?.team?.name),
    teamLogo: logoOf(a?.team),
    headshot: str(a?.headshot?.href),
    tables,
    season: str(seasonType?.displayName),
  };
}

/**
 * Each column's per-game average, one decimal: plain counts ("12" → "14.3"), made–attempted
 * pairs ("5-11" → "4.7-10.2"), and percentages from the season's totals when ESPN gives them
 * (an average of game percentages would weigh a 1-for-1 night like a 10-for-20 one).
 */
function perGame(labels: string[], rows: string[][], totals: string[] | null): string[] | null {
  if (!rows.length) return null;
  const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
  return labels.map((label, i) => {
    const vals = rows.map((r) => r[i]).filter((v): v is string => v !== undefined && v !== "" && v !== "--");
    if (!vals.length) return "";
    if (/%/.test(label)) {
      if (totals?.[i]) return totals[i];
      const n = vals.map(Number).filter((x) => !Number.isNaN(x));
      return n.length ? one(n.reduce((a, b) => a + b, 0) / n.length) : "";
    }
    const pairs = vals.map((v) => v.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/));
    if (pairs.every(Boolean)) {
      const made = pairs.reduce((t, m) => t + Number(m![1]), 0) / vals.length;
      const att = pairs.reduce((t, m) => t + Number(m![2]), 0) / vals.length;
      return `${one(made)}-${one(att)}`;
    }
    const n = vals.map(Number);
    if (n.some((x) => Number.isNaN(x))) return "";
    return one(n.reduce((a, b) => a + b, 0) / vals.length);
  });
}

// ---------------------------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------------------------

export type TeamGame = {
  id: string;
  date: string;
  atVs: "vs" | "@";
  opponent: string;
  opponentLogo: string | null;
  result: "W" | "L" | "T" | null;
  /** "31–17", the team's score first. */
  score: string | null;
};
export type AtsSplit = { name: string; label: string; wins: number; losses: number; pushes: number };
export type TeamHistory = {
  name: string;
  logo: string | null;
  record: string | null;
  /** Finished games, newest first. */
  recent: TeamGame[];
  /** Against the spread this season (ESPN's splits: overall, home, away, favorite, underdog …). */
  ats: AtsSplit[];
};

const scoreOf = (c: any): number | null => {
  const v = c?.score?.value ?? c?.score?.displayValue ?? c?.score;
  const n = Number(v);
  return v === undefined || v === null || v === "" || Number.isNaN(n) ? null : n;
};

/** A team's recent results this season and, with `ats`, its record against the spread. */
export async function getTeamHistory(sport: TeamSport, teamId: string, ats: boolean): Promise<TeamHistory | null> {
  const sched = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/teams/${encodeURIComponent(teamId)}/schedule`, 900);
  if (!sched) return null;
  const team = sched.team ?? {};
  const recent: TeamGame[] = [];
  for (const e of Array.isArray(sched.events) ? sched.events : []) {
    const comp = e?.competitions?.[0];
    const done = comp?.status?.type?.completed ?? e?.status?.type?.completed;
    if (!done) continue;
    const cs: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
    const us = cs.find((c) => String(c?.id ?? c?.team?.id) === String(teamId));
    const them = cs.find((c) => c !== us);
    if (!us || !them) continue;
    const a = scoreOf(us);
    const b = scoreOf(them);
    recent.push({
      id: String(e.id),
      date: String(e.date ?? comp?.date ?? ""),
      atVs: us.homeAway === "away" ? "@" : "vs",
      opponent: str(them?.team?.abbreviation) ?? str(them?.team?.shortDisplayName) ?? "—",
      opponentLogo: logoOf(them?.team),
      result: us.winner === true ? "W" : them.winner === true ? "L" : a !== null && b !== null ? (a > b ? "W" : a < b ? "L" : "T") : null,
      score: a !== null && b !== null ? `${a}–${b}` : null,
    });
  }
  recent.sort((x, y) => y.date.localeCompare(x.date));

  let splits: AtsSplit[] = [];
  if (ats) {
    const year = sched.requestedSeason?.year ?? sched.season?.year;
    if (year) {
      const body = await getJson(
        `https://sports.core.api.espn.com/v2/sports/${corePath(sport)}/seasons/${year}/types/2/teams/${encodeURIComponent(teamId)}/ats`,
        3600,
      );
      splits = (Array.isArray(body?.items) ? body.items : [])
        .map((x: any) => ({
          name: str(x?.type?.name) ?? "",
          label: atsLabel(str(x?.type?.name), str(x?.type?.description)),
          wins: Number(x?.wins ?? 0) || 0,
          losses: Number(x?.losses ?? 0) || 0,
          pushes: Number(x?.pushes ?? 0) || 0,
        }))
        .filter((x: AtsSplit) => x.wins + x.losses + x.pushes > 0);
      // Overall first.
      splits.sort((x, y) => Number(y.name === "atsOverall") - Number(x.name === "atsOverall"));
    }
  }

  const record = str(team?.recordSummary) ?? str(team?.record?.items?.[0]?.summary) ?? null;
  return { name: str(team?.displayName) ?? str(team?.name) ?? "Team", logo: logoOf(team), record, recent, ats: splits };
}

function atsLabel(name: string | null, description: string | null): string {
  const known: Record<string, string> = {
    atsOverall: "Overall",
    atsHome: "Home",
    atsAway: "Away",
    atsRoad: "Away",
    atsFavorite: "As favorite",
    atsUnderdog: "As underdog",
    atsHomeFavorite: "Home favorite",
    atsAwayFavorite: "Away favorite",
    atsHomeUnderdog: "Home underdog",
    atsAwayUnderdog: "Away underdog",
    atsConference: "In conference",
    atsDivision: "In division",
  };
  return (name && known[name]) ?? description?.replace(/^ATS\s*/i, "").replace(/\s*Record$/i, "") ?? name ?? "ATS";
}
