import { NextResponse } from "next/server";
import { getTeamHistory } from "@/lib/espnProfiles";
import { teamSport } from "@/lib/sports";

// A team's pop-up from My Picks: GET /api/espn/team?sport=ncaaf&id=333&ats=1
// Recent results, and the record against the spread for ATS pools. ESPN's public data, cached;
// signed-in players only, like every page (proxy.ts).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Bad team id" }, { status: 400 });
  const history = await getTeamHistory(teamSport(url.searchParams.get("sport")), id, url.searchParams.get("ats") === "1");
  if (!history) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(history, { headers: { "Cache-Control": "private, max-age=300" } });
}
