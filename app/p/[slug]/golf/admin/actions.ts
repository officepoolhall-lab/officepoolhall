"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { requirePoolCommissioner } from "@/lib/pool";

// Golf commissioner actions. Each re-checks the commissioner; the database checks again
// (RLS on pools, golf_admin_update_event).

/** Pool name, entry fee, and the commissioner's rules and notes shown to players on Home. */
export async function saveGolfSettings(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "The pool needs a name." };
  if (name.length > 80) return { error: "Keep the name to 80 characters." };
  const fee = Number(form.get("entry_fee") || 0);
  if (!Number.isFinite(fee) || fee < 0) return { error: "The entry fee must be 0 or more." };
  const rules = String(form.get("rules_note") ?? "").trim();
  if (rules.length > 4000) return { error: "Keep the rules and notes to 4,000 characters." };
  const settings = { ...((ctx.pool.settings as Record<string, unknown> | null) ?? {}), rules_note: rules || null };
  const { error } = await ctx.supabase.from("pools").update({ name, entry_fee: fee, settings }).eq("id", ctx.pool.id);
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: "Settings saved." };
}

/** Rename a tournament, close one under way as final, or cancel / restore one. */
export async function updateGolfEvent(slug: string, eventId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const name = form.has("name") ? String(form.get("name") ?? "").trim() : null;
  const status = form.has("status") ? String(form.get("status")) : null;
  if (name !== null && !name) return { error: "The tournament needs a name." };
  const { error } = await ctx.supabase.rpc("golf_admin_update_event", { p_event_id: eventId, p_name: name, p_status: status });
  if (error) return { error: error.message.includes("golf_admin_update_event") ? "Run the latest database update first." : error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: status === "final" ? "Closed as final." : status === "canceled" ? "Canceled." : status === "scheduled" ? "Restored." : "Saved." };
}
