import "server-only";
import { espnScoreboardJson } from "./microCache";
import { hasStarted } from "./locks";
import type { SlateGame } from "./pool";
import { ESPN_PATH, groupsParam, type TeamSport } from "./sports";

// Live game clocks from ESPN's scoreboard, for games in progress: the clock and period
// ("8:44 2nd Half", "Halftime", "5:12 3rd") plus the score at that moment, which is fresher than
// the stored score (the poller saves scores every couple of minutes). Fetched only for the
// dates that have a live game, cached 30 seconds; if ESPN doesn't answer, games just show "Live".


export function espnDate(at: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(at)).replaceAll("-", "");
}

type EspnStatus = { type?: { state?: string; shortDetail?: string } };
type EspnEvent = {
  id?: string | number;
  // ESPN puts the status on the event (checked on a live game, Oct 20 2026); some feeds also
  // repeat it on the competition, so either is read.
  status?: EspnStatus;
  competitions?: {
    status?: { type?: { state?: string; shortDetail?: string } };
    competitors?: { homeAway?: string; score?: string; team?: { id?: string | number; abbreviation?: string } }[];
    // In-game detail (checked on live football, Oct 20 2026): the last play and, in football,
    // down and distance and which team has the ball.
    situation?: { lastPlay?: { text?: string }; downDistanceText?: string; possession?: string | number };
  }[];
};

export function isLive(g: SlateGame, now: number) {
  return !g.voided && hasStarted(g, now) && g.status !== "final" && !g.overridden && g.status !== "postponed" && g.status !== "cancelled";
}

export type LiveDetail = {
  clock: string;
  home: number | null;
  away: number | null;
  lastPlay: string | null;
  situation: string | null;
  /** Football: which side has the ball. */
  possession: "home" | "away" | null;
  /** ESPN's team ids on its home and away sides, to match against our game's sides. */
  homeTeam: string | null;
  awayTeam: string | null;
};

/**
 * ESPN's detail turned to our game's sides: a game stored with the teams the other way round
 * from ESPN (a neutral-site game, say) gets its scores and possession swapped to match.
 */
export function orientLive<T extends { home: number | null; away: number | null; possession: "home" | "away" | null; homeTeam?: string | null; awayTeam?: string | null }>(
  d: T,
  ourHomeEspnId: string | null | undefined,
): T {
  const flipped = !!ourHomeEspnId && d.awayTeam === ourHomeEspnId && d.homeTeam !== ourHomeEspnId;
  if (!flipped) return d;
  return { ...d, home: d.away, away: d.home, possession: d.possession === "home" ? "away" : d.possession === "away" ? "home" : null };
}

/**
 * Live detail for in-progress games on the given ESPN dates (yyyymmdd), keyed by ESPN game id.
 * Fetched fresh every time (`maxAgeSeconds` is no longer used; kept so callers don't change).
 */
export async function fetchLiveDetails(sport: TeamSport, dates: string[], _maxAgeSeconds = 30): Promise<Map<string, LiveDetail>> {
  const found = new Map<string, LiveDetail>();
  await Promise.all(
    [...new Set(dates)].slice(0, 4).map(async (date) => {
      try {
        // Fresh within 15 seconds, one fetch shared by every page view in that time (lib/microCache).
        const body = (await espnScoreboardJson(`https://site.api.espn.com/apis/site/v2/sports/${ESPN_PATH[sport]}/scoreboard?dates=${date}${groupsParam(sport)}&limit=500`)) as { events?: EspnEvent[] } | null;
        if (!body) return;
        for (const e of body.events ?? []) {
          const c = e.competitions?.[0];
          const status = c?.status ?? e.status;
          const detail = status?.type?.shortDetail;
          if (e.id == null || !detail || status?.type?.state !== "in") continue;
          const score = (side: string) => {
            const v = c?.competitors?.find((x) => x.homeAway === side)?.score;
            return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
          };
          const teamId = (side: string) => {
            const id = c?.competitors?.find((x) => x.homeAway === side)?.team?.id;
            return id != null ? String(id) : null;
          };
          const sit = c?.situation;
          const holder = sit?.possession != null ? c?.competitors?.find((x) => String(x.team?.id) === String(sit.possession)) : undefined;
          const ball = holder?.team?.abbreviation;
          const down = sit?.downDistanceText?.trim();
          found.set(String(e.id), {
            // "8:44 - 2nd Half" → "8:44 2nd Half"
            clock: detail.replace(/\s+-\s+/, " "),
            home: score("home"),
            away: score("away"),
            lastPlay: cleanPlay(sit?.lastPlay?.text),
            situation: down ? (ball ? `${ball} · ${down}` : down) : null,
            possession: holder?.homeAway === "home" || holder?.homeAway === "away" ? holder.homeAway : null,
            homeTeam: teamId("home"),
            awayTeam: teamId("away"),
          });
        }
      } catch {
        // Nothing this time; games still show Live with the stored score.
      }
    }),
  );
  return found;
}

/** The games with each live one's clock, score, situation and last play filled in from ESPN. */
export async function withLiveClocks(sport: TeamSport, games: SlateGame[], now: number): Promise<SlateGame[]> {
  const live = games.filter((g) => isLive(g, now) && g.espnId && !g.espnId.startsWith("demo-"));
  if (!live.length) return games;
  const found = await fetchLiveDetails(sport, live.map((g) => espnDate(g.startAt)));
  return games.map((g) => {
    const raw = g.espnId ? found.get(g.espnId) : undefined;
    if (!raw || !isLive(g, now)) return g;
    // Matched by team, not ESPN's home/away (which can be the other way round from ours).
    const f = orientLive(raw, g.home?.espn_id);
    return { ...g, clock: f.clock, lastPlay: f.lastPlay, situation: f.situation, possession: f.possession, homeScore: f.home ?? g.homeScore, awayScore: f.away ?? g.awayScore };
  });
}

/**
 * ESPN's play-by-play line, trimmed for a one-line note: no leading clock "(08:24)", no
 * formation ("No Huddle-Shotgun"), no jersey numbers.
 * "(08:24) No Huddle-Shotgun #17 J.Kohl pass incomplete short middle to #4 J.Resar thrown to FIU40"
 *   → "J.Kohl pass incomplete short middle to J.Resar thrown to FIU40"
 */
export function cleanPlay(text: string | undefined): string | null {
  if (!text) return null;
  const out = text
    .replace(/^\(\s*\d{1,2}:\d{2}\s*\)\s*/, "")
    .replace(/^(?:(?:No Huddle|Shotgun|Pistol|Under Center|Direct Snap)[-\s]*)+/i, "")
    .replace(/#\d+\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return out || null;
}
