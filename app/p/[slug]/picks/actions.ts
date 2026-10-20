"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PickInput = { game_id: string; picked_side: "home" | "away"; confidence: number | null };
export type SaveResult = { ok: true } | { ok: false; error: string; picks: PickInput[] };

/**
 * Save the player's full pick set. The database (submit_picks) enforces membership,
 * per-game locks, pick count and tiers using its own clock. On rejection we return
 * what's actually saved so the screen can resync.
 */
export async function savePicks(slug: string, slateId: string, picks: PickInput[], forUserId?: string): Promise<SaveResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_picks", {
    p_slate_id: slateId,
    p_picks: picks,
    ...(forUserId ? { p_user_id: forUserId } : {}),
  });
  if (!error) {
    // An edit on the player's behalf can regrade the week, which moves standings and the grid.
    revalidatePath(`/p/${slug}`, forUserId ? "layout" : undefined);
    return { ok: true };
  }

  let saved;
  if (forUserId) {
    // The commissioner reads any entry through member_picks; a co-manager reads the entry
    // they run directly (RLS lets them).
    const viaCommissioner = await supabase.rpc("member_picks", { p_slate_id: slateId, p_user_id: forUserId });
    saved = viaCommissioner.error
      ? (await supabase.from("picks").select("*").eq("slate_id", slateId).eq("user_id", forUserId)).data
      : viaCommissioner.data;
  } else {
    const { data: auth } = await supabase.auth.getClaims();
    ({ data: saved } = await supabase
      .from("picks")
      .select("*")
      .eq("slate_id", slateId)
      .eq("user_id", auth?.claims.sub ?? ""));
  }
  return {
    ok: false,
    error: error.message,
    picks: (saved ?? []).map((p) => ({ game_id: p.game_id, picked_side: p.picked_side as "home" | "away", confidence: p.confidence })),
  };
}

/** A champion pick for one tournament (teamId null clears it). The database enforces the lock. */
export async function saveTournamentPick(slug: string, tournamentId: string, teamId: string | null, forUserId?: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_tournament_pick", {
    p_tournament_id: tournamentId,
    p_team_id: teamId,
    ...(forUserId ? { p_user_id: forUserId } : {}),
  });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, forUserId ? "layout" : undefined);
  return {};
}
