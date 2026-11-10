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

export type GolferHistory = {
  /** Events this golfer played in this pool's season so far, in order. */
  rows: { week: number; event: string; pos: string | null; earnings: number; final: boolean }[];
  /** Events played so far this season (final or under way), whether or not the golfer entered. */
  eventsPlayed: number;
};

/**
 * How one golfer has done in this pool's season so far: finish and prize money per event.
 * Read-only; the database only returns results to members of the pool.
 */
export async function golferHistory(slug: string, golferId: string): Promise<GolferHistory | { error: string }> {
  const supabase = await createClient();
  const { data: pool } = await supabase.from("pools").select("id").eq("slug", slug).maybeSingle();
  if (!pool) return { error: "Pool not found." };
  const { data: events } = await supabase
    .from("golf_events")
    .select("id, name, sort_order, status")
    .eq("pool_id", pool.id)
    .neq("status", "canceled")
    .order("sort_order");
  const played = (events ?? []).map((e, i) => ({ ...e, week: i + 1 })).filter((e) => e.status === "final" || e.status === "in_progress");
  if (!played.length) return { rows: [], eventsPlayed: 0 };
  const { data: results, error } = await supabase
    .from("golf_results")
    .select("event_id, pos, earnings")
    .eq("espn_golfer_id", golferId)
    .in("event_id", played.map((e) => e.id));
  if (error) return { error: "Couldn't load this golfer's results." };
  const byEvent = new Map((results ?? []).map((r) => [r.event_id, r]));
  return {
    eventsPlayed: played.length,
    rows: played
      .filter((e) => byEvent.has(e.id))
      .map((e) => ({
        week: e.week,
        event: e.name,
        pos: byEvent.get(e.id)!.pos,
        earnings: Number(byEvent.get(e.id)!.earnings),
        final: e.status === "final",
      })),
  };
}
