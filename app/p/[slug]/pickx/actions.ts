"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { getPoolBase, requirePoolCommissioner } from "@/lib/pool";
import { isPickX, pickXSettings, pickXSettingsError, type PickXSettings } from "@/lib/pickx";

/** Save an entry's Pick X teams (the database checks the count, the field and every limit). */
export async function savePickXPicks(slug: string, forUserId: string | null, teamIds: string[]): Promise<{ error?: string }> {
  const ctx = await getPoolBase(slug);
  if (!isPickX(ctx.pool.settings)) return { error: "This isn't a Pick X pool." };
  const { error } = await ctx.supabase.rpc("submit_pickx", {
    p_pool_id: ctx.pool.id,
    p_team_ids: teamIds,
    p_user_id: forUserId ?? ctx.entryUserId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return {};
}

/** An entry's tiebreaker guess: the championship game's total points. */
export async function savePickXTiebreak(slug: string, forUserId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await getPoolBase(slug);
  if (!isPickX(ctx.pool.settings)) return { error: "This isn't a Pick X pool." };
  const raw = String(form.get("tiebreak") ?? "").trim();
  if (raw && !/^\d{1,3}$/.test(raw)) return { error: "Enter the total as a whole number, like 141." };
  const { error } = await (ctx.supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
    .rpc("submit_pickx_tiebreak", { p_pool_id: ctx.pool.id, p_tiebreak: raw ? Number(raw) : null, p_user_id: forUserId ?? ctx.entryUserId });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: "Tiebreaker saved." };
}

/** The commissioner's Pick X rules: how many teams, the scoring and the limits. */
export async function savePickXSettings(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  if (!isPickX(ctx.pool.settings)) return { error: "This isn't a Pick X pool." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "The pool needs a name." };
  const fee = Number(form.get("entry_fee") || 0);
  if (!Number.isFinite(fee) || fee < 0) return { error: "The entry fee must be 0 or more." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("pick_x")));
  } catch {
    return { error: "The rules are missing." };
  }
  const s: PickXSettings = pickXSettings({ pick_x: raw });
  const problem = pickXSettingsError(s);
  if (problem) return { error: problem };
  const settings = { ...((ctx.pool.settings as Record<string, unknown> | null) ?? {}), format: "pick_x", pick_x: s };
  const { error } = await ctx.supabase.from("pools").update({ name, entry_fee: fee, settings }).eq("id", ctx.pool.id);
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: "Settings saved." };
}
