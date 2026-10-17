// Pull lines from The Odds API and store each as a new game_lines row.
// Schedule: every 2 h via pg_cron; only runs for sports with an ATS slate in draft
// (lines freeze at publish, so this saves quota). The commissioner's "Refresh lines"
// button calls it with { sport, bookmaker } to run regardless.
import { adminClient, handler, json, readBody, requireServiceRole } from "../_shared/supabase.ts";
import { fetchOdds, lineFor } from "../_shared/odds.ts";
import type { Sport } from "../_shared/espn.ts";

const MATCH_WINDOW_MS = 12 * 3_600_000;

Deno.serve(handler(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;

  const apiKey = Deno.env.get("ODDS_API_KEY");
  if (!apiKey) return json({ error: "ODDS_API_KEY is not set" }, 400);

  const db = adminClient();
  const body = await readBody<{ sport: Sport; bookmaker: string }>(req);

  let targets: { sport: Sport; bookmaker: string }[];
  if (body.sport) {
    targets = [{ sport: body.sport, bookmaker: body.bookmaker ?? "draftkings" }];
  } else {
    const { data, error } = await db.rpc("line_sync_targets");
    if (error) return json({ error: error.message }, 500);
    targets = (data ?? []) as typeof targets;
  }
  if (!targets.length) return json({ ok: true, skipped: "no draft ATS slates" });

  const results = [];
  for (const { sport, bookmaker } of targets) {
    const { events, remaining } = await fetchOdds(sport, bookmaker, apiKey);

    const { data: teams } = await db.from("teams").select("id, odds_api_name").eq("sport", sport).not("odds_api_name", "is", null);
    const byName = new Map((teams ?? []).map((t) => [t.odds_api_name as string, t.id as string]));

    const { data: games } = await db
      .from("games")
      .select("id, home_team_id, away_team_id, start_at")
      .eq("sport", sport)
      .gte("start_at", new Date(Date.now() - 6 * 3_600_000).toISOString())
      .lte("start_at", new Date(Date.now() + 21 * 86_400_000).toISOString());

    const lines = [];
    const unmatched = new Set<string>();
    for (const ev of events) {
      const homeId = byName.get(ev.home_team);
      const awayId = byName.get(ev.away_team);
      if (!homeId) unmatched.add(ev.home_team);
      if (!awayId) unmatched.add(ev.away_team);
      if (!homeId || !awayId) continue;

      const t = new Date(ev.commence_time).getTime();
      const near = (g: { start_at: string }) => Math.abs(new Date(g.start_at).getTime() - t) < MATCH_WINDOW_MS;
      // The Odds API and ESPN sometimes disagree on home/away at neutral sites.
      const same = games?.find((g) => g.home_team_id === homeId && g.away_team_id === awayId && near(g));
      const swapped = same ? null : games?.find((g) => g.home_team_id === awayId && g.away_team_id === homeId && near(g));
      const game = same ?? swapped;
      if (!game) continue;

      const ourHomeName = same ? ev.home_team : ev.away_team;
      const l = lineFor(ev, bookmaker, ourHomeName);
      if (l.spread === null && l.moneyline === null) continue;
      lines.push({
        game_id: game.id,
        bookmaker,
        home_spread: l.spread,
        home_moneyline: l.moneyline,
        away_moneyline: l.otherMoneyline,
      });
      await db.from("games").update({ odds_api_id: ev.id }).eq("id", game.id).is("odds_api_id", null);
    }

    if (lines.length) {
      const { error } = await db.from("game_lines").insert(lines);
      if (error) return json({ error: error.message }, 500);
    }
    // Never drop unmatched names silently: queue them for the commissioner.
    const now = new Date().toISOString();
    for (const raw_name of unmatched) {
      await db.from("team_match_queue").upsert(
        { sport, source: "odds_api", raw_name, last_seen_at: now },
        { onConflict: "sport,source,raw_name" },
      );
    }

    results.push({ sport, bookmaker, events: events.length, lines: lines.length, unmatched: unmatched.size, quota_remaining: remaining });
  }

  return json({ ok: true, results });
}));
