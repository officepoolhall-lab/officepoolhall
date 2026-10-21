import { NextResponse } from "next/server";
import { fetchLiveDetails } from "@/lib/liveClock";

// Live game detail for My Picks' poll: GET /api/live?sport=ncaaf&dates=20261020,20261021
// ESPN's public data (clock, score, situation, last play for games in progress); like every
// page, signed-in players only (proxy.ts). ESPN is asked at most every few seconds per date
// however many players are watching.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sport = url.searchParams.get("sport") === "ncaab" ? "ncaab" : "ncaaf";
  const dates = (url.searchParams.get("dates") ?? "").split(",").filter((d) => /^\d{8}$/.test(d)).slice(0, 4);
  if (!dates.length) return NextResponse.json({ games: {} });
  const found = await fetchLiveDetails(sport, dates, 5);
  return NextResponse.json({ games: Object.fromEntries(found) }, { headers: { "Cache-Control": "no-store" } });
}
