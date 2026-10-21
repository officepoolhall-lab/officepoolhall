import "server-only";
import { hasStarted } from "./locks";
import type { SlateGame } from "./pool";

// Live game clocks from ESPN's scoreboard, for games in progress: the clock and period
// ("8:44 2nd Half", "Halftime", "5:12 3rd") plus the score at that moment, which is fresher than
// the stored score (the poller saves scores every couple of minutes). Fetched only for the
// dates that have a live game, cached 30 seconds; if ESPN doesn't answer, games just show "Live".

const PATH = { ncaaf: "football/college-football", ncaab: "basketball/mens-college-basketball" } as const;
const GROUP = { ncaaf: "80", ncaab: "50" } as const;

function espnDate(at: string) {
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
    competitors?: { homeAway?: string; score?: string }[];
  }[];
};

export function isLive(g: SlateGame, now: number) {
  return !g.voided && hasStarted(g, now) && g.status !== "final" && !g.overridden && g.status !== "postponed" && g.status !== "cancelled";
}

/** The games with each live one's clock (and current score) filled in from ESPN. */
export async function withLiveClocks(sport: "ncaaf" | "ncaab", games: SlateGame[], now: number): Promise<SlateGame[]> {
  const live = games.filter((g) => isLive(g, now) && g.espnId && !g.espnId.startsWith("demo-"));
  if (!live.length) return games;
  const found = new Map<string, { clock: string; home: number | null; away: number | null }>();
  await Promise.all(
    [...new Set(live.map((g) => espnDate(g.startAt)))].map(async (date) => {
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}/scoreboard?dates=${date}&groups=${GROUP[sport]}&limit=500`, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
          next: { revalidate: 30 },
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
          // "8:44 - 2nd Half" → "8:44 2nd Half"
          found.set(String(e.id), { clock: detail.replace(/\s+-\s+/, " "), home: score("home"), away: score("away") });
        }
      } catch {
        // No clock this time; the game still shows Live with the stored score.
      }
    }),
  );
  return games.map((g) => {
    const f = g.espnId ? found.get(g.espnId) : undefined;
    if (!f || !isLive(g, now)) return g;
    return { ...g, clock: f.clock, homeScore: f.home ?? g.homeScore, awayScore: f.away ?? g.awayScore };
  });
}
