import { NextResponse } from "next/server";
import { DEMO_LIVE_ID } from "@/lib/golfDemo";
import { getScorecard } from "@/lib/golfScorecard";

// One golfer's hole-by-hole scorecard for the Leaderboard: GET /api/golf/scorecard?event=…&golfer=…
// ESPN's public data; like every page, signed-in players only (proxy.ts). Cached a minute,
// so ESPN is asked at most once a minute per golfer however many players are looking.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const event = url.searchParams.get("event") ?? "";
  const golfer = url.searchParams.get("golfer") ?? "";
  if (!(/^\d{1,15}$/.test(event) || event === DEMO_LIVE_ID) || !/^\d{1,15}$/.test(golfer)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const card = await getScorecard(event, golfer, 60);
  return NextResponse.json({ card }, { headers: { "Cache-Control": "no-store" } });
}
