import { NextResponse } from "next/server";
import { espnBracketResults, saveTitleTotal } from "@/lib/bracketSync";
import { getBracket } from "@/lib/brackets";
import type { PoolContext } from "@/lib/pool";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Vercel Cron, every 15 minutes in March and April: fills in NCAA Tournament winners from ESPN
 * for every bracket that has locked and isn't finished, so brackets and Pick X standings keep
 * themselves. Winners a commissioner set are never changed. Exits at once when no bracket is
 * being played. When CRON_SECRET is set, only Vercel Cron may call it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  // Read loosely: the joined shape and grade_bracket aren't in the generated types.
  const db = admin as unknown as { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = Date.now();
  // Brackets that locked within the last 30 days: a tournament under way (or just over).
  const { data: brackets } = await db
    .from("brackets")
    .select("id, pool_id, pool:pools!inner ( id, settings )")
    .lte("lock_at", new Date(now).toISOString())
    .gte("lock_at", new Date(now - 30 * 86_400_000).toISOString());
  const out: { bracket: string; added: number }[] = [];
  for (const b of (brackets ?? []) as { id: string; pool_id: string; pool: { id: string; settings: Record<string, any> | null } }[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const bracket = await getBracket({ supabase: admin, pool: { id: b.pool_id } } as unknown as PoolContext);
    if (!bracket || bracket.id !== b.id) continue;
    // Finished, and nothing left to learn.
    if (Object.keys(bracket.results).length >= 63 && b.pool.settings?.pick_x?.tiebreaker !== "title_total") continue;
    const sync = await espnBracketResults(bracket, now);
    if (sync.added) {
      const { error } = await db.from("bracket_results").upsert({ bracket_id: b.id, results: sync.results, updated_at: new Date().toISOString() });
      if (!error) await db.rpc("grade_bracket", { p_bracket_id: b.id });
    }
    await saveTitleTotal(admin, b.pool, sync.titleTotal);
    out.push({ bracket: b.id, added: sync.added });
  }
  return NextResponse.json({ ok: true, brackets: out });
}
