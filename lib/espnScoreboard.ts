import "server-only";
import type { SlateGame } from "./pool";

// A whole day of Division I games straight from ESPN's scoreboard (not just the pool's slate),
// for the Scoreboard tab: basketball is every D-I vs D-I game (groups=50, both sides in a D-I
// conference); football is FBS (groups=80). Shaped like the pool's slate games so the same
// cards and live updates work. Cached briefly: 20 seconds today, longer for other days.

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const PATH = { ncaaf: "football/college-football", ncaab: "basketball/mens-college-basketball" } as const;
const GROUP = { ncaaf: "80", ncaab: "50" } as const;
const HEADERS = { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" };

// Same short names the schedule import uses (supabase/functions/_shared/espn.ts).
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

/* eslint-disable @typescript-eslint/no-explicit-any -- ESPN's JSON is untyped */

/** ESPN conference group id → short name (real conferences only, not division labels). Cached a day. */
async function conferences(sport: "ncaaf" | "ncaab"): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const res = await fetch(`${BASE}/${PATH[sport]}/scoreboard/conferences`, { headers: HEADERS, next: { revalidate: 86400 }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return out;
    const data: any = await res.json();
    for (const c of data?.conferences ?? []) {
      if (!c?.parentGroupId || !c?.groupId || !c?.name || /^(FBS|FCS)\b|division/i.test(c.name)) continue;
      out.set(String(c.groupId), SHORT_CONFERENCE[c.name] ?? String(c.name).replace(/ Conference$/, ""));
    }
  } catch {
    // No conference names this time; games still show.
  }
  return out;
}

function status(type: any): SlateGame["status"] {
  const name = String(type?.name ?? "");
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCELED") || name.includes("CANCELLED") || name.includes("FORFEIT")) return "cancelled";
  if (type?.completed || type?.state === "post") return "final";
  if (type?.state === "in") return "in_progress";
  return "scheduled";
}

const rank = (r: any) => (r?.current && r.current >= 1 && r.current <= 25 ? Number(r.current) : null);

export type DayGame = SlateGame & { records: { home: string | null; away: string | null } };

/** One day's games (date = yyyymmdd, US Eastern, as ESPN counts days), by start time. */
export async function getEspnDay(sport: "ncaaf" | "ncaab", date: string, isToday: boolean): Promise<DayGame[]> {
  const [confs, data] = await Promise.all([
    conferences(sport),
    fetch(`${BASE}/${PATH[sport]}/scoreboard?dates=${date}&groups=${GROUP[sport]}&limit=500`, {
      headers: HEADERS,
      next: { revalidate: isToday ? 20 : 900 },
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);
  const out: DayGame[] = [];
  for (const e of (data as any)?.events ?? []) {
    const c = e?.competitions?.[0];
    const home = c?.competitors?.find((x: any) => x?.homeAway === "home");
    const away = c?.competitors?.find((x: any) => x?.homeAway === "away");
    if (!home || !away || e?.id == null) continue;
    const team = (x: any) => ({
      id: `espn-${x.team?.id}`,
      espn_id: x.team?.id != null ? String(x.team.id) : null,
      name: String(x.team?.displayName ?? x.team?.name ?? ""),
      short_name: x.team?.shortDisplayName ?? x.team?.location ?? null,
      abbreviation: x.team?.abbreviation ?? null,
      logo_url: x.team?.logo ?? null,
      conference: x.team?.conferenceId != null ? (confs.get(String(x.team.conferenceId)) ?? null) : null,
    });
    const h = team(home);
    const a = team(away);
    // Basketball: Division I against Division I only (non-D-I opponents have no D-I conference).
    if (sport === "ncaab" && confs.size > 0 && (!h.conference || !a.conference)) continue;
    const st = status(c?.status?.type ?? e?.status?.type);
    const started = st === "in_progress" || st === "final";
    const national = (c?.broadcasts ?? []).find((b: any) => b?.market === "national") ?? c?.broadcasts?.[0];
    const record = (x: any) => (x?.records ?? []).find((r: any) => r?.type === "total")?.summary ?? null;
    const startAt = new Date(e.date).toISOString();
    out.push({
      id: String(e.id),
      startAt,
      timeTbd: c?.timeValid === false,
      manualTime: false,
      lockAt: startAt,
      effectiveLockAt: startAt,
      status: st,
      homeScore: started && home.score != null ? Number(home.score) : null,
      awayScore: started && away.score != null ? Number(away.score) : null,
      overridden: false,
      neutral: Boolean(c?.neutralSite),
      venue: c?.venue?.address?.city ? [c.venue.address.city, c.venue.address.state || c.venue.address.country].filter(Boolean).join(", ") : null,
      tv: national?.names?.join("/") || null,
      homeRank: rank(home.curatedRank),
      awayRank: rank(away.curatedRank),
      spread: null,
      voided: false,
      espnId: String(e.id),
      clock: null,
      lastPlay: null,
      situation: null,
      possession: null,
      home: h,
      away: a,
      records: { home: record(home), away: record(away) },
    } as DayGame);
  }
  return out.sort((x, y) => x.startAt.localeCompare(y.startAt) || x.id.localeCompare(y.id));
}
