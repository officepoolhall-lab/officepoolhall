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
  /** College players' year in school ("Junior", "Redshirt Sophomore"); null otherwise. */
  year: string | null;
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
    // ESPN's experience for college players is their class; for the NFL it's seasons played.
    year: sport === "nfl" ? null : (str(a?.experience?.displayValue) ?? str(a?.class?.displayValue) ?? null),
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
  /** "Kansas City" / "Alabama": the opponent's name, for screens with room for it. */
  opponentName: string | null;
  opponentLogo: string | null;
  result: "W" | "L" | "T" | null;
  /** "31–17", the team's score first. */
  score: string | null;
  /** Points for and against, for grading against the line. */
  pointsFor: number | null;
  pointsAgainst: number | null;
  neutral: boolean;
  /** The team's own closing spread (−6.5 = favored by 6.5); null when no line was found. */
  spread: number | null;
  /** Covered, lost or pushed against that spread. */
  ats: "W" | "L" | "P" | null;
};
export type AtsSplit = { name: string; label: string; wins: number; losses: number; pushes: number };
export type TeamHistory = {
  name: string;
  abbreviation: string | null;
  logo: string | null;
  record: string | null;
  /** Finished games, newest first. */
  recent: TeamGame[];
  /** Against the spread this season, worked out game by game from each game's line: overall,
      home, away, as favorite, as underdog. Only for ATS pools. */
  ats: AtsSplit[];
};

const scoreOf = (c: any): number | null => {
  const v = c?.score?.value ?? c?.score?.displayValue ?? c?.score;
  const n = Number(v);
  return v === undefined || v === null || v === "" || Number.isNaN(n) ? null : n;
};

/** At most this many finished games get a line looked up (a basketball season runs past 30). */
const MAX_LINES = 40;

/**
 * A team's results this season and, with `ats`, each game's closing line from ESPN and the
 * record against it. `storedLine` fills in a game ESPN has no line for (this site's own saved
 * lines, by ESPN game id; the team's spread).
 */
export async function getTeamHistory(
  sport: TeamSport,
  teamId: string,
  ats: boolean,
  storedLine?: (espnGameIds: string[]) => Promise<Map<string, { homeSpread: number }>>,
): Promise<TeamHistory | null> {
  const sched = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/teams/${encodeURIComponent(teamId)}/schedule`, 900);
  if (!sched) return null;
  const team = sched.team ?? {};
  const abbreviation = str(team?.abbreviation);
  const recent: (TeamGame & { home: boolean })[] = [];
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
      home: us.homeAway === "home",
      neutral: comp?.neutralSite === true,
      opponent: str(them?.team?.abbreviation) ?? str(them?.team?.shortDisplayName) ?? "—",
      opponentName: str(them?.team?.location) ?? str(them?.team?.shortDisplayName) ?? str(them?.team?.displayName),
      opponentLogo: logoOf(them?.team),
      result: us.winner === true ? "W" : them.winner === true ? "L" : a !== null && b !== null ? (a > b ? "W" : a < b ? "L" : "T") : null,
      score: a !== null && b !== null ? `${a}–${b}` : null,
      pointsFor: a,
      pointsAgainst: b,
      spread: null,
      ats: null,
    });
  }
  recent.sort((x, y) => y.date.localeCompare(x.date));

  let splits: AtsSplit[] = [];
  if (ats && recent.length) {
    const lined = recent.slice(0, MAX_LINES);
    // ESPN's line for each game (cached a day: a finished game's line doesn't change).
    const espnLines = await mapLimit(lined, 8, (g) => gameHomeSpread(sport, g.id));
    const missing = lined.filter((_, i) => espnLines[i] === null).map((g) => g.id);
    const stored = missing.length && storedLine ? await storedLine(missing).catch(() => new Map()) : new Map();
    lined.forEach((g, i) => {
      const homeSpread = espnLines[i] ?? stored.get(g.id)?.homeSpread ?? null;
      if (homeSpread === null) return;
      const spread = g.home ? homeSpread : -homeSpread;
      g.spread = spread;
      if (g.pointsFor !== null && g.pointsAgainst !== null) {
        const m = g.pointsFor - g.pointsAgainst + spread;
        g.ats = m > 0 ? "W" : m < 0 ? "L" : "P";
      }
    });
    const tally = (name: string, label: string, keep: (g: TeamGame & { home: boolean }) => boolean): AtsSplit => {
      const gs = lined.filter((g) => g.ats && keep(g));
      return { name, label, wins: gs.filter((g) => g.ats === "W").length, losses: gs.filter((g) => g.ats === "L").length, pushes: gs.filter((g) => g.ats === "P").length };
    };
    splits = [
      tally("atsOverall", "Overall", () => true),
      tally("atsHome", "Home", (g) => g.home && !g.neutral),
      tally("atsAway", "Away", (g) => !g.home && !g.neutral),
      tally("atsNeutral", "Neutral Site", (g) => g.neutral),
      tally("atsFavorite", "Favorite", (g) => (g.spread ?? 0) < 0),
      tally("atsUnderdog", "Underdog", (g) => (g.spread ?? 0) > 0),
    ].filter((x) => x.wins + x.losses + x.pushes > 0);
  }

  const record = str(team?.recordSummary) ?? str(team?.record?.items?.[0]?.summary) ?? null;
  return {
    name: str(team?.displayName) ?? str(team?.name) ?? "Team",
    abbreviation,
    logo: logoOf(team),
    record,
    recent: recent.map(({ home: _home, ...g }) => g),
    ats: splits,
  };
}

/**
 * A finished game's closing spread from the home side (−6.5 = home favored), from ESPN's odds
 * for the game; null when ESPN has none. The first provider with a spread wins (ESPN lists its
 * own book first).
 */
async function gameHomeSpread(sport: TeamSport, eventId: string): Promise<number | null> {
  const body = await getJson(
    `https://sports.core.api.espn.com/v2/sports/${corePath(sport)}/events/${encodeURIComponent(eventId)}/competitions/${encodeURIComponent(eventId)}/odds`,
    86400,
  );
  for (const o of Array.isArray(body?.items) ? body.items : []) {
    const v = homeSpreadOf(o);
    if (v !== null) return v;
  }
  return null;
}

/** One provider's line as the home team's spread. */
function homeSpreadOf(o: any): number | null {
  const details = str(o?.details);
  if (details && /^(even|pk|pick)/i.test(details.trim())) return 0;
  const raw = Number(o?.spread);
  if (o?.spread === undefined || o?.spread === null || Number.isNaN(raw)) return null;
  const size = Math.abs(raw);
  if (size === 0) return 0;
  // Which side is favored: the odds' own flags, else the sign ESPN gives the home spread.
  const homeFav = o?.homeTeamOdds?.favorite;
  const awayFav = o?.awayTeamOdds?.favorite;
  if (homeFav === true || awayFav === false) return -size;
  if (awayFav === true || homeFav === false) return size;
  return raw;
}

/** `fn` over `items`, at most `limit` at a time, results in order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
