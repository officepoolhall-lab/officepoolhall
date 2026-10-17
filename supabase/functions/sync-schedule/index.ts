// Upsert the next N days of games (and their teams) from ESPN.
// Schedule: daily ~6:00 CT via pg_cron. Body (optional): { sport?: "ncaab"|"ncaaf", days?: number }
import { adminClient, handler, json, readBody, requireServiceRole } from "../_shared/supabase.ts";
import { espnDate, fetchConferences, fetchScoreboard, type Sport } from "../_shared/espn.ts";

Deno.serve(handler(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;

  const body = await readBody<{ sport: Sport; days: number }>(req);
  const days = Math.min(Math.max(body.days ?? 14, 1), 30);
  const db = adminClient();

  let sports: Sport[];
  if (body.sport) {
    sports = [body.sport];
  } else {
    const { data } = await db.from("pools").select("sport");
    sports = [...new Set((data ?? []).map((p) => p.sport as Sport))];
  }

  const summary: Record<string, { games: number; teams: number }> = {};
  for (const sport of sports) {
    const conferences = await fetchConferences(sport);
    let games = 0;
    const teamIds = new Set<string>();
    for (let i = 0; i < days; i++) {
      const date = espnDate(new Date(Date.now() + i * 86_400_000));
      const feed = await fetchScoreboard(sport, date, conferences);
      const { error } = await db.rpc("ingest_espn", { p_sport: sport, p_teams: feed.teams, p_games: feed.games });
      if (error) return json({ error: error.message, sport, date }, 500);
      games += feed.games.length;
      feed.teams.forEach((t) => teamIds.add(t.espn_id));
    }
    summary[sport] = { games, teams: teamIds.size };
  }

  return json({ ok: true, days, summary });
}));
