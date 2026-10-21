import "server-only";
import { hasStarted } from "./locks";
import type { SlateGame } from "./pool";

// Live game clocks from ESPN's scoreboard, for games in progress: the clock and period
// ("8:44 2nd Half", "Halftime", "5:12 3rd") plus the score at that moment, which is fresher than
// the stored score (the poller saves scores every couple of minutes). Fetched only for the
// dates that have a live game, cached 30 seconds; if ESPN doesn't answer, games just show "Live".

const PATH = { ncaaf: "football/college-football", ncaab: "basketball/mens-college-basketball" } as const;
const GROUP = { ncaaf: "80", ncaab: "50" } as const;

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

export type LiveDetail = { clock: string; home: number | null; away: number | null; lastPlay: string | null; situation: string | null };

/**
 * Live detail for in-progress games on the given ESPN dates (yyyymmdd), keyed by ESPN game id.
 * `maxAgeSeconds` is how stale a cached scoreboard may be: 30 for page renders, a few seconds
 * for the live poll on My Picks.
 */
export async function fetchLiveDetails(sport: "ncaaf" | "ncaab", dates: string[], maxAgeSeconds = 30): Promise<Map<string, LiveDetail>> {
  const found = new Map<string, LiveDetail>();
  await Promise.all(
    [...new Set(dates)].slice(0, 4).map(async (date) => {
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}/scoreboard?dates=${date}&groups=${GROUP[sport]}&limit=500`, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
          next: { revalidate: maxAgeSeconds },
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { events?: EspnEvent[] };
        for (const e of body.events ?? []) {
          const c = e.competitions?.[0];
          const status = c?.status ?? e.status;
          const detail = status?.type?.shortDetail;
          if (e.id == null || !detail || status?.type?.state !== "in") continue;
          const score = (side: string) => {
            const v = c?.competitors?.find((x) => x.homeAway === side)?.score;
            return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
          };
          const sit = c?.situation;
          const ball = sit?.possession != null ? c?.competitors?.find((x) => String(x.team?.id) === String(sit.possession))?.team?.abbreviation : undefined;
          const down = sit?.downDistanceText?.trim();
          found.set(String(e.id), {
            // "8:44 - 2nd Half" → "8:44 2nd Half"
            clock: detail.replace(/\s+-\s+/, " "),
            home: score("home"),
            away: score("away"),
            lastPlay: cleanPlay(sit?.lastPlay?.text),
            situation: down ? (ball ? `${ball} · ${down}` : down) : null,
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
export async function withLiveClocks(sport: "ncaaf" | "ncaab", games: SlateGame[], now: number): Promise<SlateGame[]> {
  const live = games.filter((g) => isLive(g, now) && g.espnId && !g.espnId.startsWith("demo-"));
  if (!live.length) return games;
  const found = await fetchLiveDetails(sport, live.map((g) => espnDate(g.startAt)));
  return games.map((g) => {
    const f = g.espnId ? found.get(g.espnId) : undefined;
    if (!f || !isLive(g, now)) return g;
    return { ...g, clock: f.clock, lastPlay: f.lastPlay, situation: f.situation, homeScore: f.home ?? g.homeScore, awayScore: f.away ?? g.awayScore };
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
