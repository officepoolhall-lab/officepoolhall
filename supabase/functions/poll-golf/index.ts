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
// thru (0 before starting), r1–r4, toPar, cut, "$$" (prize money).
//
// Majors pools (settings.golf_format = "majors") also get each golfer's score to par, whether
// they're out (missed cut / WD / DQ), holes played and strokes per round; salary cap pools
// also get hole-by-hole scorecards for every rostered golfer (ESPN core API linescores), for
// the fantasy points.
import { createClient } from "npm:@supabase/supabase-js@2";

type Golfer = {
  id: string;
  name: string;
  pos: string;
  earnings: number;
  status: string;
  tee: string | null;
  thru: number;
  playedR4: boolean;
  toPar: number | null;
  out: boolean;
  rounds: (number | null)[];
};
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

/**
 * One golfer's hole-by-hole scores: { rounds: [{ round, holes: [{ hole, par, strokes }] }] }
 * (the shape lib/golfMajors.ts scores). Rounds not started are left out.
 */
async function fetchScorecard(eventId: string, golferId: string) {
  const res = await fetch(
    `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${eventId}/competitions/${eventId}/competitors/${golferId}/linescores`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) return null;
  const body = await res.json();
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
  const items: any[] = Array.isArray(body?.items) ? body.items : [];
  const rounds = items
    .map((r, i) => ({
      round: num(r?.period) ?? i + 1,
      holes: (Array.isArray(r?.linescores) ? r.linescores : []).map((h: any, j: number) => {
        const strokes = num(h?.value);
        return { hole: num(h?.period) ?? j + 1, par: num(h?.par), strokes: strokes && strokes > 0 ? strokes : null };
      }),
    }))
    .filter((r) => r.holes.some((h: { strokes: number | null }) => h.strokes !== null));
  return { rounds };
}

/**
 * Whether ESPN has called the tournament complete (its scoreboard status), for an event cut
 * short: a 54-hole (or 36-hole) finish never plays round 4.
 */
async function espnCompleted(espnId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${espnId}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; OfficePoolHall/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return false;
    const body = await res.json();
    const type = body?.events?.[0]?.competitions?.[0]?.status?.type ?? body?.events?.[0]?.status?.type;
    return type?.completed === true || type?.state === "post" || /final|complete/i.test(String(type?.name ?? ""));
  } catch {
    return false;
  }
}

/**
 * A tournament shortened by weather: everyone has finished, prize money is posted, but round 4
 * was never played. Final once ESPN calls it complete (checked only then, so rarely).
 */
function maybeShortened(golfers: Golfer[]): boolean {
  return (
    golfers.length > 0 &&
    golfers.every((g) => g.status === "post") &&
    golfers.some((g) => g.earnings > 0) &&
    !golfers.some((g) => g.playedR4)
  );
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
    const tp = typeof o.toPar === "string" ? o.toPar.trim() : typeof o.toPar === "number" ? String(o.toPar) : "";
    const pos = o.pos === undefined || o.pos === null || o.pos === "" ? "-" : String(o.pos);
    const round = (v: unknown) => (typeof v === "number" && v > 0 ? v : typeof v === "string" && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null);
    byId.set(String(o.id), {
      id: String(o.id),
      name: o.name,
      pos,
      earnings: Number(o["$$"]) || 0,
      status: typeof o.status === "string" ? o.status : "",
      tee,
      thru: Number(o.thru) || 0,
      playedR4: typeof o.r4 === "number" && o.r4 > 0,
      toPar: tp === "E" ? 0 : /^[+-]?\d+$/.test(tp) ? Number(tp) : null,
      // Out: ESPN's cut flag, or CUT / WD / DQ where the place, score, holes played or tee time go.
      out: o.cut === true || [o.tee, o.toPar, o.thru, pos].some((v) => typeof v === "string" && /^(MC|CUT|WD|DQ|MDF)$/i.test(v.trim())),
      rounds: [o.r1, o.r2, o.r3, o.r4].map(round),
    });
  }
  return [...byId.values()];
}

/**
 * Status from the golfers. Final needs everyone finished AND round 4 played AND prize money
 * posted: between rounds every golfer can show finished, and a final event is frozen for good.
 * (A tournament cut short is closed separately: see maybeShortened.)
 * Under way: anyone finished, on the course, or with holes played. Otherwise scheduled.
 */
function deriveState(golfers: Golfer[]): State {
  const firstTee = golfers.map((g) => g.tee).filter((t): t is string => !!t).sort()[0] ?? null;
  if (golfers.length === 0) return { status: "scheduled", firstTee };
  const allDone = golfers.every((g) => g.status === "post");
  if (allDone && golfers.some((g) => g.playedR4) && golfers.some((g) => g.earnings > 0)) return { status: "final", firstTee };
  // Between rounds every golfer shows "pre" for the next round with 0 holes: a round already
  // played (or a score to par) still means the tournament has started.
  const started = golfers.some((g) => g.status === "post" || g.status === "in" || g.thru > 0 || g.toPar !== null || g.rounds.some((r) => r !== null && r > 0));
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

    // Salary cap Majors pools, whose rostered golfers need hole-by-hole scores.
    const poolIds = [...new Set((all ?? []).map((e) => e.pool_id))];
    const { data: pools } = poolIds.length ? await db.from("pools").select("id, settings").in("id", poolIds) : { data: [] };
    const salaryPools = new Set(
      (pools ?? [])
        .filter((p) => (p.settings as any)?.golf_format === "majors" && (p.settings as any)?.majors?.contest === "salary")
        .map((p) => p.id as string),
    );

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
      let state = deriveState(golfers);
      // Cut short (54 holes): final once ESPN calls it complete and the money is posted.
      if (state.status === "in_progress" && maybeShortened(golfers) && (await espnCompleted(ev.espn_id))) {
        state = { ...state, status: "final" };
      }

      // The lock follows the first tee time only while the event hasn't started.
      // Never once the stored lock has passed: picks are for the whole tournament.
      const lockPassed = !!ev.start_at && Date.parse(ev.start_at) <= Date.now();
      if (state.status === "scheduled" && !lockPassed && ev.status === "scheduled" && state.firstTee && state.firstTee !== ev.start_at) {
        const { error: lockError } = await db.from("golf_events").update({ start_at: state.firstTee }).eq("id", ev.id);
        if (lockError) return json({ error: lockError.message, event: ev.espn_id }, 500);
      }

      // Salary cap majors: hole-by-hole for every rostered golfer, while it's being played (and
      // one last time as it goes final: stored before the results, which freeze a final event).
      let cards = 0;
      if (state.status !== "scheduled" && salaryPools.has(ev.pool_id)) {
        const { data: rostered } = await db.from("golf_lineups").select("espn_golfer_id").eq("event_id", ev.id);
        const ids = [...new Set((rostered ?? []).map((r) => r.espn_golfer_id))];
        const out: { espn_golfer_id: string; scorecard: unknown }[] = [];
        for (let i = 0; i < ids.length; i += 8) {
          const batch = await Promise.all(ids.slice(i, i + 8).map((id) => fetchScorecard(ev.espn_id, id).catch(() => null)));
          batch.forEach((card, k) => card && out.push({ espn_golfer_id: ids[i + k], scorecard: card }));
        }
        if (out.length) {
          const { error: cardError } = await db.rpc("ingest_golf_scorecards", { p_event_id: ev.id, p_cards: out });
          if (cardError) report.push({ event: ev.espn_id, scorecards: cardError.message });
          cards = out.length;
        }
      }
      if (golfers.length > 0) {
        const { error: resultsError } = await db.rpc("ingest_golf_results", {
          p_event_id: ev.id,
          p_status: state.status,
          p_results: golfers.map((g) => ({
            espn_golfer_id: g.id,
            golfer_name: g.name,
            pos: g.pos,
            earnings: g.earnings,
            to_par: g.toPar,
            out: g.out,
            thru: g.thru,
            rounds: g.rounds,
          })),
        });
        if (resultsError) return json({ error: resultsError.message, event: ev.espn_id }, 500);
      }
      report.push({ event: ev.espn_id, name: ev.name, status: state.status, firstTee: state.firstTee, golfers: golfers.length, scorecards: cards });
    }
    return json({ ok: true, polled: events.length, report });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
