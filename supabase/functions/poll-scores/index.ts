// Update scores/status for games on published slates that have started and
// aren't final, then grade any that went final.
// Schedule: every 2 minutes via pg_cron. Exits without calling ESPN when nothing is live,
// so it's cheap to run around the clock (and DST-proof).
import { adminClient, handler, json, requireServiceRole } from "../_shared/supabase.ts";
import { espnDate, fetchScoreboard, type Sport } from "../_shared/espn.ts";

Deno.serve(handler(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;

  const db = adminClient();
  const { data: pending, error } = await db.rpc("games_to_poll");
  if (error) return json({ error: error.message }, 500);
  if (!pending?.length) return json({ ok: true, polled: 0 });

  // One scoreboard request per (sport, ESPN date)
  const requests = new Map<string, { sport: Sport; date: string }>();
  for (const g of pending) {
    const date = espnDate(new Date(g.start_at));
    requests.set(`${g.sport}:${date}`, { sport: g.sport as Sport, date });
  }

  const pendingIds = new Set(pending.map((g) => g.game_id));
  const toGrade = new Set<string>();
  for (const { sport, date } of requests.values()) {
    const feed = await fetchScoreboard(sport, date);
    const { data: finals, error: ingestError } = await db.rpc("ingest_espn", {
      p_sport: sport,
      p_teams: feed.teams,
      p_games: feed.games,
    });
    if (ingestError) return json({ error: ingestError.message, sport, date }, 500);
    for (const id of (finals ?? []) as string[]) if (pendingIds.has(id)) toGrade.add(id);
  }

  for (const id of toGrade) {
    const { error: gradeError } = await db.rpc("grade_game", { p_game_id: id });
    if (gradeError) return json({ error: gradeError.message, game_id: id }, 500);
  }

  return json({ ok: true, polled: pending.length, requests: requests.size, graded: toGrade.size });
}));
