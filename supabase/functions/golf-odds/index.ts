// golf-odds: DraftKings odds to win each major, from The Odds API (the-odds-api.com), stored in
// golf_odds for building tiers and salaries in Majors pools.
//
// Runs twice a day from pg_cron (invoke_edge_function('golf-odds')). Service role only. Reads
// only the majors that a pool has and that haven't started. Each read costs one credit of the
// API plan (one market, one region); at most 8 a day.
//
// Needs the secret ODDS_API_KEY (Supabase → Edge Functions → Secrets).
// Self-contained (no ../_shared imports) so it can be pasted into the Supabase dashboard editor.
//
// The Odds API v4: GET /v4/sports/{sport}/odds?regions=us&markets=outrights&bookmakers=draftkings
// &oddsFormat=american → [{ bookmakers: [{ key, markets: [{ key: "outrights", outcomes: [{ name, price }] }] }] }].
import { createClient } from "npm:@supabase/supabase-js@2";

const MARKETS: Record<string, string> = {
  masters: "golf_masters_tournament_winner",
  pga: "golf_pga_championship_winner",
  us_open: "golf_us_open_winner",
  open: "golf_the_open_championship_winner",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function isServiceRole(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!isServiceRole(req)) return json({ error: "service role required" }, 403);
  const key = Deno.env.get("ODDS_API_KEY");
  if (!key) return json({ error: "ODDS_API_KEY isn't set" }, 500);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: events, error } = await db.from("golf_events").select("major").not("major", "is", null).eq("status", "scheduled");
  if (error) return json({ error: error.message }, 500);
  const majors = [...new Set((events ?? []).map((e) => e.major as string))].filter((m) => MARKETS[m]);

  const report: Record<string, unknown>[] = [];
  for (const major of majors) {
    const market = MARKETS[major];
    const url = `https://api.the-odds-api.com/v4/sports/${market}/odds?apiKey=${encodeURIComponent(key)}&regions=us&markets=outrights&bookmakers=draftkings&oddsFormat=american`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.status === 404 || res.status === 422) {
        report.push({ major, note: "no market listed yet" });
        continue;
      }
      if (!res.ok) {
        report.push({ major, error: `HTTP ${res.status}`, remaining: res.headers.get("x-requests-remaining") });
        continue;
      }
      const body = await res.json();
      const prices = new Map<string, number>();
      for (const ev of Array.isArray(body) ? body : []) {
        for (const b of ev?.bookmakers ?? []) {
          if (b?.key !== "draftkings") continue;
          for (const m of b?.markets ?? []) {
            if (m?.key !== "outrights") continue;
            for (const o of m?.outcomes ?? []) {
              if (typeof o?.name === "string" && Number.isFinite(o?.price)) prices.set(o.name, Math.round(o.price));
            }
          }
        }
      }
      if (!prices.size) {
        report.push({ major, note: "DraftKings has no odds listed yet" });
        continue;
      }
      const { error: e } = await db.rpc("ingest_golf_odds", {
        p_odds_key: market,
        p_rows: [...prices].map(([golfer_name, price]) => ({ golfer_name, price })),
      });
      report.push({ major, golfers: prices.size, error: e?.message, remaining: res.headers.get("x-requests-remaining") });
    } catch (e) {
      report.push({ major, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ ok: true, report });
});
