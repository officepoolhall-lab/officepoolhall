// poll-golf: refresh PGA Tour events from ESPN's leaderboard pages — the pick lock (earliest
// tee time while an event is scheduled), the status, and each golfer's place and prize money.
// Final events are frozen by ingest_golf_results.
//
// Runs every 10 minutes from pg_cron (invoke_edge_function('poll-golf')). Service role only.
// Self-contained (no ../_shared imports) so it can be pasted into the Supabase dashboard editor.
//
// Which events are read each run: any under way; scheduled ones starting within 8 days; and
// the next two scheduled ones with no tee time yet (to pick up their tee times when posted).
// Demo events ("demo-" ids) are never read.
//
// ESPN fields relied on (checked Nov 2026 on final and pre-event pages; see the project doc
// claude/golf-espn-data.md): id, name, pos, status ("pre"/"post"), tee (ISO, or "CUT"),
// thru (0 before starting), r4, "$$" (prize money).
import { createClient } from "npm:@supabase/supabase-js@2";

type Golfer = { id: string; name: string; pos: string; earnings: number; status: string; tee: string | null; thru: number; playedR4: boolean };
type State = { status: "scheduled" | "in_progress" | "final"; firstTee: string | null };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Only the service role may run this (pg_cron); the gateway has already checked the signature. */
function isServiceRole(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

async function fetchLeaderboard(espnId: string): Promise<string> {
  const res = await fetch(`https://www.espn.com/golf/leaderboard/_/tournamentId/${espnId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ESPN leaderboard ${espnId} returned HTTP ${res.status}`);
  return await res.text();
}

/** Every golfer object the page embeds ({"guid":...}), one per ESPN id. */
function parseGolfers(html: string): Golfer[] {
  const byId = new Map<string, Golfer>();
  for (const m of html.matchAll(/\{"guid":[^{}]*\}/g)) {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(m[0]);
    } catch {
      continue;
    }
    if (o["$$"] === undefined || typeof o.name !== "string" || o.id === undefined) continue;
    const tee = typeof o.tee === "string" && !Number.isNaN(Date.parse(o.tee)) ? new Date(o.tee).toISOString() : null;
    byId.set(String(o.id), {
      id: String(o.id),
      name: o.name,
      pos: o.pos === undefined || o.pos === null || o.pos === "" ? "-" : String(o.pos),
      earnings: Number(o["$$"]) || 0,
      status: typeof o.status === "string" ? o.status : "",
      tee,
      thru: Number(o.thru) || 0,
      playedR4: typeof o.r4 === "number" && o.r4 > 0,
    });
  }
  return [...byId.values()];
}

/**
 * Status from the golfers. Final needs everyone finished AND round 4 played AND prize money
 * posted: between rounds every golfer can show finished, and a final event is frozen for good.
 * Under way: anyone finished, on the course, or with holes played. Otherwise scheduled.
 * (A tournament shortened to 54 holes stays "under way"; the commissioner can close it.)
 */
function deriveState(golfers: Golfer[]): State {
  const firstTee = golfers.map((g) => g.tee).filter((t): t is string => !!t).sort()[0] ?? null;
  if (golfers.length === 0) return { status: "scheduled", firstTee };
  const allDone = golfers.every((g) => g.status === "post");
  if (allDone && golfers.some((g) => g.playedR4) && golfers.some((g) => g.earnings > 0)) return { status: "final", firstTee };
  const started = golfers.some((g) => g.status === "post" || g.status === "in" || g.thru > 0);
  return { status: started ? "in_progress" : "scheduled", firstTee };
}

Deno.serve(async (req) => {
  if (!isServiceRole(req)) return json({ error: "service role required" }, 403);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: all, error } = await db
      .from("golf_events")
      .select("id, espn_id, name, start_at, status, pool_id, sort_order")
      .in("status", ["scheduled", "in_progress"])
      .not("espn_id", "like", "demo-%")
      .order("pool_id")
      .order("sort_order");
    if (error) return json({ error: error.message }, 500);

    const horizon = Date.now() + 8 * 86_400_000;
    const untimedSeen = new Map<string, number>();
    const events = (all ?? []).filter((e) => {
      if (e.status === "in_progress") return true;
      if (e.start_at) return Date.parse(e.start_at) <= horizon;
      // The next two untimed events per pool, in calendar order.
      const n = untimedSeen.get(e.pool_id) ?? 0;
      untimedSeen.set(e.pool_id, n + 1);
      return n < 2;
    });

    // Several pools can share a tournament: read each ESPN page once per run.
    const pages = new Map<string, Promise<Golfer[]>>();
    const read = (id: string) => {
      if (!pages.has(id)) pages.set(id, fetchLeaderboard(id).then(parseGolfers));
      return pages.get(id)!;
    };

    const report: Record<string, unknown>[] = [];
    for (const ev of events) {
      let golfers: Golfer[];
      try {
        golfers = await read(ev.espn_id);
      } catch (e) {
        report.push({ event: ev.espn_id, name: ev.name, error: e instanceof Error ? e.message : String(e) });
        continue;
      }
      const state = deriveState(golfers);

      // The lock follows the first tee time only while the event hasn't started.
      if (state.status === "scheduled" && state.firstTee && state.firstTee !== ev.start_at) {
        const { error: lockError } = await db.from("golf_events").update({ start_at: state.firstTee }).eq("id", ev.id);
        if (lockError) return json({ error: lockError.message, event: ev.espn_id }, 500);
      }

      if (golfers.length > 0) {
        const { error: resultsError } = await db.rpc("ingest_golf_results", {
          p_event_id: ev.id,
          p_status: state.status,
          p_results: golfers.map((g) => ({ espn_golfer_id: g.id, golfer_name: g.name, pos: g.pos, earnings: g.earnings })),
        });
        if (resultsError) return json({ error: resultsError.message, event: ev.espn_id }, 500);
      }
      report.push({ event: ev.espn_id, name: ev.name, status: state.status, firstTee: state.firstTee, golfers: golfers.length });
    }
    return json({ ok: true, polled: events.length, report });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
