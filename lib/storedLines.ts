import "server-only";

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * For the team pop-up's ATS column: the line this site saved for each ESPN game (the last line
 * pulled before kickoff, else any pool's locked spread), for games ESPN has no line for.
 */
export function storedLineLookup(supabase: Db, sport: string) {
  return async (espnIds: string[]) => {
    const out = new Map<string, { homeSpread: number }>();
    const { data: games } = await supabase.from("games").select("id, espn_id, start_at").eq("sport", sport).in("espn_id", espnIds);
    if (!games?.length) return out;
    const ids = (games as { id: string }[]).map((g) => g.id);
    const [{ data: lines }, { data: locked }] = await Promise.all([
      supabase.from("game_lines").select("game_id, home_spread, captured_at").in("game_id", ids).not("home_spread", "is", null).order("captured_at", { ascending: false }),
      supabase.from("slate_games").select("game_id, locked_home_spread").in("game_id", ids).not("locked_home_spread", "is", null),
    ]);
    type Line = { game_id: string; home_spread: number | null; captured_at: string };
    type Locked = { game_id: string; locked_home_spread: number | null };
    for (const g of games as { id: string; espn_id: string | null; start_at: string }[]) {
      const line = ((lines ?? []) as Line[]).find((l) => l.game_id === g.id && l.captured_at <= g.start_at) ?? ((lines ?? []) as Line[]).find((l) => l.game_id === g.id);
      const spread = line?.home_spread ?? ((locked ?? []) as Locked[]).find((l) => l.game_id === g.id)?.locked_home_spread;
      if (g.espn_id && spread !== null && spread !== undefined) out.set(g.espn_id, { homeSpread: Number(spread) });
    }
    return out;
  };
}
