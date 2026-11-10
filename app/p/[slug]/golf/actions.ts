"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";

/**
 * Save an entry's golfer for one event. The database (submit_golf_pick) enforces the tee-time
 * lock, the one-use-per-season rule, and co-manager access. The golfer's name is read from the
 * event's field, so it can't be typed in.
 */
export async function saveGolfPick(slug: string, eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const golferId = String(form.get("golfer") ?? "");
  const forUserId = String(form.get("for") ?? "") || undefined;
  if (!golferId) return { error: "Choose a golfer." };

  const supabase = await createClient();
  const { data: golfer } = await supabase
    .from("golf_results")
    .select("golfer_name")
    .eq("event_id", eventId)
    .eq("espn_golfer_id", golferId)
    .maybeSingle();
  if (!golfer) return { error: "That golfer isn't in this event's field." };

  const { error } = await supabase.rpc("submit_golf_pick", {
    p_event_id: eventId,
    p_golfer_id: golferId,
    p_golfer_name: golfer.golfer_name,
    ...(forUserId ? { p_user_id: forUserId } : {}),
  });
  if (error) return { error: error.message };

  revalidatePath(`/p/${slug}/golf`, "layout");
  return { ok: `Saved: ${golfer.golfer_name}.` };
}
