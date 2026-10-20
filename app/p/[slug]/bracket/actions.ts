"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Save a whole bracket ({"r-g": team id}). The database checks it follows the field and the lock. */
export async function saveBracketPicks(slug: string, bracketId: string, picks: Record<string, string>, forUserId?: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_bracket", {
    p_bracket_id: bracketId,
    p_picks: picks,
    ...(forUserId ? { p_user_id: forUserId } : {}),
  });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}/bracket`);
  return {};
}
