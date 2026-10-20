import "server-only";

// Teams' overall records ("6-0") from ESPN's scoreboard (the same feed as the schedule and
// scores; shape checked Oct 2026: competitors[].records[] with type "total"). Fetched for the
// dates a page's games fall on, cached an hour, so records update within an hour of finals.
// No table or job; if ESPN is unreachable the pages simply show no records.

const PATH = { ncaaf: "football/college-football", ncaab: "basketball/mens-college-basketball" } as const;
const GROUP = { ncaaf: "80", ncaab: "50" } as const;
const REVALIDATE_SECONDS = 3600;

/** yyyymmdd in US Eastern (ESPN's scoreboard dates). */
function espnDate(at: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(at)).replaceAll("-", "");
}

type Competitor = { team?: { id?: string | number }; records?: { type?: string; summary?: string }[] };

/** ESPN team id → overall record, for every team playing on the given games' dates. */
export async function getTeamRecords(sport: "ncaaf" | "ncaab", startTimes: string[]): Promise<Record<string, string>> {
  const dates = [...new Set(startTimes.map(espnDate))].slice(0, 14);
  const out: Record<string, string> = {};
  await Promise.all(
    dates.map(async (date) => {
      try {
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${PATH[sport]}/scoreboard?dates=${date}&groups=${GROUP[sport]}&limit=500`, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
          next: { revalidate: REVALIDATE_SECONDS },
          // Records are a nicety: a slow day's scoreboard is skipped rather than holding the page.
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { events?: { competitions?: { competitors?: Competitor[] }[] }[] };
        for (const e of body.events ?? []) {
          for (const c of e.competitions?.[0]?.competitors ?? []) {
            const id = c.team?.id;
            const total = c.records?.find((r) => r.type === "total")?.summary;
            if (id != null && total) out[String(id)] = total;
          }
        }
      } catch {
        // One missing day only costs that day's records.
      }
    }),
  );
  return out;
}
