import { NextResponse } from "next/server";
import { syncNflSeason } from "@/lib/nflSchedule";

export const maxDuration = 60;

/**
 * Vercel Cron, every morning: the whole NFL season's schedule from ESPN into the shared games
 * table (lib/nflSchedule.ts), so every NFL pool has every week's games and any time change.
 * When CRON_SECRET is set, only Vercel Cron may call it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await syncNflSeason();
  return NextResponse.json(r, { status: r.error ? 502 : 200 });
}
