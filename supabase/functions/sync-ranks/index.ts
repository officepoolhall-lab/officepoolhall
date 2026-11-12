// sync-ranks: re-read ESPN's scoreboards for recent and upcoming days so each game's team
// ranks match ESPN's (the AP poll; for football, the CFP rankings once released), including
// games already played this week. Scores and status are refreshed the same way; ingest_espn
// keeps them on the right team.
//
// Runs hourly from pg_cron: invoke_edge_function('sync-ranks', '{"back": 8, "days": 3}').
// Body: { back?: days before today (0–150), days?: days from today (1–30), sport? }.
// A one-time season backfill: '{"back": 120}'.
//
// Self-contained (copies of _shared/espn.ts and _shared/supabase.ts inlined) so it can be
// pasted into the Supabase dashboard editor. Service role only.
import { createClient } from "npm:@supabase/supabase-js@2";

// ---- ESPN (copy of _shared/espn.ts) ----

type Sport = "ncaab" | "ncaaf";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";
const PATH: Record<Sport, string> = {
  ncaab: "basketball/mens-college-basketball",
  ncaaf: "football/college-football",
};
// groups=50 → all D1 basketball; groups=80 → FBS football
const GROUP: Record<Sport, string> = { ncaab: "50", ncaaf: "80" };

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

type FeedTeam = {
  espn_id: string;
  name: string;
  short_name: string;
  abbreviation: string;
  logo_url: string | null;
  conference: string | null;
};

type FeedGame = {
  espn_id: string;
  season: number;
  home_espn_id: string;
  away_espn_id: string;
  start_at: string;
  time_tbd: boolean;
  status: "scheduled" | "in_progress" | "final" | "postponed" | "cancelled";
  home_score: number | null;
  away_score: number | null;
  neutral_site: boolean;
  tv_network: string | null;
  home_rank: number | null;
  away_rank: number | null;
  venue: string | null;
};

async function getJson(url: string) {
  // ESPN rejects Deno's default User-Agent with a 403.
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
  });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

/**
 * ESPN conference group id → conference name, from scoreboard/conferences (one request).
 * Teams carry their conferenceId on every scoreboard. Only real conferences (with a parent
 * group) are kept: division-level groups like "FBS (I-A)" or "NCAA Division I" are dropped,
 * so ingest never overwrites a stored conference with a division label.
 */
async function fetchConferences(sport: Sport): Promise<Map<string, string>> {
  const data = await getJson(`${BASE}/${PATH[sport]}/scoreboard/conferences`);
  const out = new Map<string, string>();
  for (const c of data.conferences ?? []) {
    if (!c.parentGroupId || !c.groupId || !c.name || /^(FBS|FCS)\b|division/i.test(c.name)) continue;
    out.set(String(c.groupId), SHORT_CONFERENCE[c.name] ?? String(c.name).replace(/ Conference$/, ""));
  }
  return out;
}

function mapStatus(type: { name?: string; state?: string; completed?: boolean }): FeedGame["status"] {
  const name = type.name ?? "";
  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCELED") || name.includes("CANCELLED") || name.includes("FORFEIT")) return "cancelled";
  if (type.completed || type.state === "post") return "final";
  if (type.state === "in" || name.includes("DELAYED") || name.includes("SUSPENDED")) return "in_progress";
  return "scheduled";
}

/** 'Las Vegas, NV', or 'Rome, Italy' abroad. Shown for neutral-site games. */
function venueLabel(address: { city?: string; state?: string; country?: string } | undefined) {
  if (!address?.city) return null;
  const region = address.state || address.country;
  return region ? `${address.city}, ${region}` : address.city;
}

function rank(r: { current?: number } | undefined) {
  return r?.current && r.current >= 1 && r.current <= 25 ? r.current : null;
}

/** One day's scoreboard. `date` is yyyymmdd (ESPN uses US Eastern dates). */
async function fetchScoreboard(sport: Sport, date: string, conferences?: Map<string, string>) {
  const data = await getJson(`${BASE}/${PATH[sport]}/scoreboard?dates=${date}&groups=${GROUP[sport]}&limit=500`);
  const teams = new Map<string, FeedTeam>();
  const games: FeedGame[] = [];

  for (const e of data.events ?? []) {
    const c = e.competitions?.[0];
    // deno-lint-ignore no-explicit-any
    const home = c?.competitors?.find((x: any) => x.homeAway === "home");
    // deno-lint-ignore no-explicit-any
    const away = c?.competitors?.find((x: any) => x.homeAway === "away");
    if (!home || !away) continue;

    for (const side of [home, away]) {
      const t = side.team;
      teams.set(String(t.id), {
        espn_id: String(t.id),
        name: t.displayName,
        short_name: t.shortDisplayName ?? t.location ?? t.displayName,
        abbreviation: t.abbreviation,
        logo_url: t.logo ?? null,
        conference: t.conferenceId != null ? (conferences?.get(String(t.conferenceId)) ?? null) : null,
      });
    }

    const status = mapStatus(c.status?.type ?? e.status?.type ?? {});
    const started = status === "in_progress" || status === "final";
    // deno-lint-ignore no-explicit-any
    const national = (c.broadcasts ?? []).find((b: any) => b.market === "national") ?? c.broadcasts?.[0];

    games.push({
      espn_id: String(e.id),
      // ESPN labels 2026-27 basketball as 2027; our season is the start year.
      season: sport === "ncaab" ? e.season.year - 1 : e.season.year,
      home_espn_id: String(home.team.id),
      away_espn_id: String(away.team.id),
      start_at: new Date(e.date).toISOString(),
      time_tbd: c.timeValid === false,
      status,
      home_score: started ? Number(home.score) : null,
      away_score: started ? Number(away.score) : null,
      neutral_site: Boolean(c.neutralSite),
      tv_network: national?.names?.join("/") || null,
      home_rank: rank(home.curatedRank),
      away_rank: rank(away.curatedRank),
      venue: venueLabel(c.venue?.address),
    });
  }

  return { teams: [...teams.values()], games };
}

/** yyyymmdd in US Eastern for an instant. */
function espnDate(at: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(at).replaceAll("-", "");
}

// ---- Supabase helpers (copy of _shared/supabase.ts) ----
function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * These jobs spend API quota, so only the service role may run them (pg_cron and
 * the app's server actions). The gateway has already verified the JWT signature;
 * here we just check its role.
 */
function requireServiceRole(req: Request): Response | null {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.role === "service_role") return null;
  } catch {
    // fall through
  }
  return json({ error: "service role required" }, 403);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function readBody<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) ?? {};
  } catch {
    return {};
  }
}

/** Wrap a handler so thrown errors (ESPN/Odds API down, etc.) come back as JSON. */
function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  };
}

Deno.serve(handler(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;
  const body = await readBody<{ sport: Sport; back: number; days: number }>(req);
  const back = Math.min(Math.max(Math.floor(body.back ?? 8), 0), 150);
  const days = Math.min(Math.max(Math.floor(body.days ?? 3), 1), 30);
  const db = adminClient();

  let sports: Sport[];
  if (body.sport === "ncaab" || body.sport === "ncaaf") sports = [body.sport];
  else {
    const { data } = await db.from("pools").select("sport");
    sports = [...new Set((data ?? []).map((p) => p.sport as string))].filter((s): s is Sport => s === "ncaab" || s === "ncaaf");
  }

  const dates: string[] = [];
  for (let i = -back; i < days; i++) dates.push(espnDate(new Date(Date.now() + i * 86_400_000)));

  const summary: Record<string, number> = {};
  for (const sport of sports) {
    let games = 0;
    // A few days at a time, to stay well inside the function's time limit on a long backfill.
    for (let k = 0; k < dates.length; k += 5) {
      const feeds = await Promise.all(dates.slice(k, k + 5).map((d) => fetchScoreboard(sport, d)));
      for (const feed of feeds) {
        if (!feed.games.length) continue;
        const { error } = await db.rpc("ingest_espn", { p_sport: sport, p_teams: feed.teams, p_games: feed.games });
        if (error) return json({ error: error.message, sport }, 500);
        games += feed.games.length;
      }
    }
    summary[sport] = games;
  }
  return json({ ok: true, back, days, summary });
}));
