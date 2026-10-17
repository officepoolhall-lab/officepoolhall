// Pull lines from The Odds API and store each as a new game_lines row.
// At most once per sport per day (see odds_pulls): the morning pg_cron run covers sports
// with an ATS slate in draft, and the commissioner's "Refresh lines" button calls it with
// { sport, bookmaker } — whichever comes first that day does the pull, later calls skip.
// One request covers every bookmaker the sport's pools use (same credit cost up to 10).
import { adminClient, handler, json, readBody, requireServiceRole } from "../_shared/supabase.ts";
import { fetchOdds, lineFor } from "../_shared/odds.ts";
import type { Sport } from "../_shared/espn.ts";

const MATCH_WINDOW_MS = 12 * 3_600_000;

/** yyyy-mm-dd in Central — matches odds_pulls.pull_date's default. */
function todayCentral() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

Deno.serve(handler(async (req) => {
  const denied = requireServiceRole(req);
  if (denied) return denied;

  const apiKey = Deno.env.get("ODDS_API_KEY");
  if (!apiKey) return json({ error: "ODDS_API_KEY is not set" }, 400);

  const db = adminClient();
  const body = await readBody<{ sport: Sport; bookmaker: string }>(req);

  let sports: Sport[];
  if (body.sport) {
    sports = [body.sport];
  } else {
    const { data, error } = await db.rpc("line_sync_targets");
    if (error) return json({ error: error.message }, 500);
    sports = [...new Set(((data ?? []) as { sport: Sport }[]).map((t) => t.sport))];
  }
  if (!sports.length) return json({ ok: true, skipped: "no draft ATS slates" });

  const results = [];
  for (const sport of sports) {
    // Every bookmaker any pool in this sport uses, plus the one asked for.
    const { data: pools } = await db.from("pools").select("settings").eq("sport", sport);
    const bookmakers = [
      ...new Set([
        ...(pools ?? []).map((p) => p.settings?.lines?.bookmaker as string | undefined),
        body.bookmaker,
      ].filter((b): b is string => Boolean(b))),
    ].slice(0, 10);
    if (!bookmakers.length) bookmakers.push("draftkings");

    // Claim today's pull for this sport; a conflict means someone already pulled today.
    const { data: claimed, error: claimError } = await db
      .from("odds_pulls")
      .upsert({ sport, bookmakers }, { onConflict: "sport,pull_date", ignoreDuplicates: true })
      .select("pulled_at");
    if (claimError) return json({ error: claimError.message }, 500);
    if (!claimed?.length) {
      const { data: last } = await db
        .from("odds_pulls").select("pulled_at, lines").eq("sport", sport)
        .order("pulled_at", { ascending: false }).limit(1).maybeSingle();
      results.push({ sport, skipped: "already pulled today", last_pulled_at: last?.pulled_at ?? null, lines: last?.lines ?? null });
      continue;
    }

    let events, remaining;
    try {
      ({ events, remaining } = await fetchOdds(sport, bookmakers, apiKey));
    } catch (e) {
      // Release today's slot so a retry can happen once the API is reachable again.
      await db.from("odds_pulls").delete().eq("sport", sport).eq("pull_date", todayCentral());
      throw e;
    }

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
      for (const bookmaker of bookmakers) {
        const l = lineFor(ev, bookmaker, ourHomeName);
        if (l.spread === null && l.moneyline === null) continue;
        lines.push({
          game_id: game.id,
          bookmaker,
          home_spread: l.spread,
          home_moneyline: l.moneyline,
          away_moneyline: l.otherMoneyline,
        });
      }
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

    await db
      .from("odds_pulls")
      .update({ events: events.length, lines: lines.length, quota_remaining: remaining ? Number(remaining) : null })
      .eq("sport", sport)
      .eq("pull_date", todayCentral());

    results.push({ sport, bookmakers, events: events.length, lines: lines.length, unmatched: unmatched.size, quota_remaining: remaining });
  }

  return json({ ok: true, results });
}));
