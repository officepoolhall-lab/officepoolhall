import { NextResponse } from "next/server";
import { getTeamHistory } from "@/lib/espnProfiles";
import { teamSport } from "@/lib/sports";
import { createClient } from "@/lib/supabase/server";

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

  const storedLine = async (espnIds: string[]) => {
    const out = new Map<string, { homeSpread: number }>();
    const { data: games } = await supabase.from("games").select("id, espn_id, start_at").eq("sport", sport).in("espn_id", espnIds);
    if (!games?.length) return out;
    const ids = games.map((g) => g.id);
    const [{ data: lines }, { data: locked }] = await Promise.all([
      supabase.from("game_lines").select("game_id, home_spread, captured_at").in("game_id", ids).not("home_spread", "is", null).order("captured_at", { ascending: false }),
      supabase.from("slate_games").select("game_id, locked_home_spread").in("game_id", ids).not("locked_home_spread", "is", null),
    ]);
    for (const g of games) {
      // The last line pulled before kickoff, else any pool's locked spread.
      const line = (lines ?? []).find((l) => l.game_id === g.id && l.captured_at <= g.start_at) ?? (lines ?? []).find((l) => l.game_id === g.id);
      const spread = line?.home_spread ?? (locked ?? []).find((l) => l.game_id === g.id)?.locked_home_spread;
      if (g.espn_id && spread !== null && spread !== undefined) out.set(g.espn_id, { homeSpread: Number(spread) });
    }
    return out;
  };

  const history = await getTeamHistory(sport, id, url.searchParams.get("ats") === "1", storedLine);
  if (!history) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(history, { headers: { "Cache-Control": "private, max-age=300" } });
}
