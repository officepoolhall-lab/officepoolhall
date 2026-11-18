import { NextResponse } from "next/server";
import { getPlayerProfile } from "@/lib/espnProfiles";
import { teamSport } from "@/lib/sports";

// A player's pop-up from the box score: GET /api/espn/player?sport=nfl&id=3139477
// ESPN's public data, cached; signed-in players only, like every page (proxy.ts).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Bad player id" }, { status: 400 });
  const profile = await getPlayerProfile(teamSport(url.searchParams.get("sport")), id);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(profile, { headers: { "Cache-Control": "private, max-age=300" } });
}
