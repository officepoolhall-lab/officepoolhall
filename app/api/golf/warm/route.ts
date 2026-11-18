import { NextResponse } from "next/server";
import { getSeasonResults } from "@/lib/golfHistory";

/**
 * Vercel Cron, each morning: reads this PGA Tour season's finished events into the saved copy,
 * so the Majors pools' History pop-up never waits on ESPN. Harmless to call (it only fills the
 * saved copy); when CRON_SECRET is set, only Vercel Cron may call it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const year = new Date().getUTCFullYear();
  // This calendar year, and next year's season once its fall events begin.
  const seasons = await Promise.all([year, year + 1].map((y) => getSeasonResults(y).then((r) => ({ season: y, events: r.events.length }))));
  return NextResponse.json({ ok: true, seasons });
}
