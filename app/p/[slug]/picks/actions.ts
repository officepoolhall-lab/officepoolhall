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
    revalidatePath(`/p/${slug}`);
    return { ok: true };
  }

  let saved;
  if (forUserId) {
    ({ data: saved } = await supabase.rpc("member_picks", { p_slate_id: slateId, p_user_id: forUserId }));
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
