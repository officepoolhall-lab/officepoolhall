import { NextResponse } from "next/server";
import { getTeamHistory } from "@/lib/espnProfiles";
import { teamSport } from "@/lib/sports";
import { createClient } from "@/lib/supabase/server";
import { storedLineLookup } from "@/lib/storedLines";

// A team's pop-up from My Picks: GET /api/espn/team?sport=ncaaf&id=333&ats=1
// Recent results and, for ATS pools, each game's line and the record against it. Lines come
// from ESPN; a game ESPN has no line for falls back to the lines this site saved (the closing
// line it pulled, else a pool's locked spread). Signed-in players only, like every page (proxy.ts).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Bad team id" }, { status: 400 });
  const sport = teamSport(url.searchParams.get("sport"));
  const supabase = await createClient();

  const history = await getTeamHistory(sport, id, url.searchParams.get("ats") === "1", storedLineLookup(supabase, sport));
  if (!history) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(history, { headers: { "Cache-Control": "private, max-age=300" } });
}
