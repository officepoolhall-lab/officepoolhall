// Refresh PGA Tour events from ESPN's leaderboard pages: lock time (earliest tee time while an
// event is scheduled), status, and each golfer's finish and earnings. Final events are frozen.
// Schedule: every 10 minutes via pg_cron. Only events not yet final, and within about 8 days
// of their start (or with no start yet), are fetched.
import { adminClient, handler, json, requireServiceRole } from "../_shared/supabase.ts";
import { deriveEventState, fetchLeaderboardHtml, parsePlayers } from "../_shared/golf.ts";

Deno.serve(handler(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;

  const db = adminClient();
  const horizon = new Date(Date.now() + 8 * 86_400_000).toISOString();
  const { data: events, error } = await db
    .from("golf_events")
    .select("id, espn_id, name, start_at, status")
    .in("status", ["scheduled", "in_progress"])
    // Demo events use "demo-" ids and are never fetched from ESPN.
    .not("espn_id", "like", "demo-%")
    .or(`start_at.is.null,start_at.lte.${horizon}`);
  if (error) return json({ error: error.message }, 500);

  const report: Record<string, unknown>[] = [];
  for (const ev of events ?? []) {
    // One event's failure (for example, a page not posted yet) shouldn't stop the others.
    let players;
    try {
      players = parsePlayers(await fetchLeaderboardHtml(ev.espn_id));
    } catch (e) {
      report.push({ event: ev.espn_id, name: ev.name, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const state = deriveEventState(players);

    // The lock follows the first tee time only while the event hasn't started.
    if (state.status === "scheduled" && state.firstTee && state.firstTee !== ev.start_at) {
      const { error: lockError } = await db
        .from("golf_events")
        .update({ start_at: state.firstTee })
        .eq("id", ev.id);
      if (lockError) return json({ error: lockError.message, event: ev.espn_id }, 500);
    }

    // No golfers on the page yet means there are no results to record.
    if (players.length > 0) {
      const { error: resultsError } = await db.rpc("ingest_golf_results", {
        p_event_id: ev.id,
        p_status: state.status,
        p_results: players.map((p) => ({
          espn_golfer_id: p.id,
          golfer_name: p.name,
          pos: p.pos,
          earnings: p.earnings,
        })),
      });
      if (resultsError) return json({ error: resultsError.message, event: ev.espn_id }, 500);
    }

    report.push({ event: ev.espn_id, name: ev.name, status: state.status, golfers: players.length });
  }

  return json({ ok: true, polled: events?.length ?? 0, report });
}));
