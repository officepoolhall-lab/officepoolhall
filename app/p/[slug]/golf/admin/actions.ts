"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { requirePoolCommissioner } from "@/lib/pool";

// Golf commissioner actions. Each re-checks the commissioner; the database checks again
// (RLS on pools, golf_admin_update_event).

/** Pool name, entry fee and the missed-pick rule. */
export async function saveGolfSettings(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "The pool needs a name." };
  if (name.length > 80) return { error: "Keep the name to 80 characters." };
  const fee = Number(form.get("entry_fee") || 0);
  if (!Number.isFinite(fee) || fee < 0) return { error: "The entry fee must be 0 or more." };
  const missed = form.get("missed_pick") === "lowest" ? "lowest" : "zero";
  const settings = { ...((ctx.pool.settings as Record<string, unknown> | null) ?? {}), missed_pick: missed };
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

// ---------------------------------------------------------------------------------------------
// Majors pools

/** Contest type, standings, tier rules or salary cap rules. */
export async function saveMajorsSettings(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const { majorsSettings, defaultPicks, defaultSizes } = await import("@/lib/golfMajors");
  const current = majorsSettings(ctx.pool.settings);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "The pool needs a name." };
  if (name.length > 80) return { error: "Keep the name to 80 characters." };
  const fee = Number(form.get("entry_fee") || 0);
  if (!Number.isFinite(fee) || fee < 0) return { error: "The entry fee must be 0 or more." };

  const contest = form.get("contest") === "salary" ? "salary" : "tiers";
  const count = [4, 6, 8].includes(Number(form.get("tier_count"))) ? Number(form.get("tier_count")) : 6;
  // Picks per tier: the defaults for the tier count unless the count is unchanged and custom picks were sent.
  const picks = (() => {
    const sent = String(form.get("tier_picks") ?? "").split(/[,\s]+/).filter(Boolean).map(Number);
    if (sent.length === count && sent.every((n) => Number.isInteger(n) && n > 0)) return sent;
    return defaultPicks(count);
  })();
  const total = picks.reduce((a, b) => a + b, 0);
  const sizes = (() => {
    const sent = String(form.get("tier_sizes") ?? "").split(/[,\s]+/).filter(Boolean).map(Number);
    if (sent.length === count && sent.every((n) => Number.isInteger(n) && n >= 0)) return sent;
    return defaultSizes(picks);
  })();
  const counting = Math.min(total, Math.max(1, Math.floor(Number(form.get("counting")) || total)));
  const budget = Math.floor(Number(form.get("budget")) || 50000);
  const roster = Math.floor(Number(form.get("roster")) || 8);
  const rankWeight = Math.min(100, Math.max(0, Number(form.get("rank_weight") ?? 50))) / 100;
  if (budget < 1000 || budget > 1_000_000) return { error: "Set a budget between $1,000 and $1,000,000." };
  if (roster < 1 || roster > 12) return { error: "A roster can have 1 to 12 golfers." };

  const majors = {
    contest,
    standings: form.get("standings") === "each" ? "each" : "cumulative",
    tiers: {
      count,
      picks,
      sizes,
      counting,
      scoring: form.get("tier_scoring") === "earnings" ? "earnings" : "to_par",
      source: ["rank", "odds", "blend", "custom"].includes(String(form.get("tier_source"))) ? String(form.get("tier_source")) : "rank",
    },
    salary: {
      ...current.salary,
      budget,
      roster,
      rankWeight,
      source: form.get("salary_source") === "custom" ? "custom" : "blend",
    },
  };
  const settings = { ...((ctx.pool.settings as Record<string, unknown> | null) ?? {}), golf_format: "majors", majors };
  const { error } = await ctx.supabase.from("pools").update({ name, entry_fee: fee, settings }).eq("id", ctx.pool.id);
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: "Settings saved." };
}

/** Add one of the four majors (ESPN's tournament id), or remove one nobody has picked for. */
export async function addMajor(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const { MAJORS } = await import("@/lib/golfMajors");
  // "event": a regular PGA Tour event, named by the admin (single-event pools).
  const event = form.get("major") === "event";
  const eventName = String(form.get("event_name") ?? "").trim();
  const major = event ? { id: "event", name: eventName } : MAJORS.find((m) => m.id === form.get("major"));
  if (!major) return { error: "Choose a major." };
  if (event && !eventName) return { error: "Enter the tournament's name." };
  const espnId = String(form.get("espn_id") ?? "").trim().match(/(\d{6,})/)?.[1] ?? "";
  const { error } = await ctx.supabase.rpc("golf_admin_add_major", {
    p_pool_id: ctx.pool.id,
    p_major: major.id,
    p_espn_id: espnId,
    p_name: major.name,
  });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: `${major.name} added. Its field and tee times come from ESPN once posted.` };
}

export async function removeMajor(slug: string, eventId: string, _?: ActionState, __?: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const { error } = await ctx.supabase.rpc("golf_admin_remove_major", { p_event_id: eventId });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: "Removed." };
}

/**
 * Build a major's field from ESPN's posted field: world rank (OWGR), DraftKings odds (stored by
 * the golf-odds function), and tiers and salaries from the pool's rules. Replaces the saved field.
 */
export async function buildMajorField(slug: string, eventId: string, _?: ActionState, __?: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const { MAJORS, buildSalaries, buildTiers, majorsSettings } = await import("@/lib/golfMajors");
  const { getWorldRankMap, golferKey } = await import("@/lib/worldRankings");
  const { getStoredOdds } = await import("@/lib/golfMajorsData");
  const s = majorsSettings(ctx.pool.settings);
  const { data: ev } = await ctx.supabase.from("golf_events").select("id, major, status").eq("id", eventId).eq("pool_id", ctx.pool.id).maybeSingle();
  if (!ev) return { error: "Tournament not found." };
  const { data: espnField } = await ctx.supabase.from("golf_results").select("espn_golfer_id, golfer_name").eq("event_id", eventId);
  if (!espnField?.length) return { error: "ESPN hasn't posted this field yet. It's read every 10 minutes from the week before." };

  const major = MAJORS.find((m) => m.id === ev.major);
  const [ranks, stored] = await Promise.all([getWorldRankMap(), major ? getStoredOdds(ctx, major.oddsKey) : Promise.resolve({ odds: new Map<string, number>(), updatedAt: null })]);
  const oddsByKey = new Map([...stored.odds].map(([name, price]) => [golferKey(name), price]));
  let field = espnField.map((g) => ({
    espn_golfer_id: g.espn_golfer_id,
    golfer_name: g.golfer_name,
    world_rank: ranks.get(golferKey(g.golfer_name)) ?? null,
    odds: oddsByKey.get(golferKey(g.golfer_name)) ?? null,
    tier: null as number | null,
    salary: null as number | null,
  }));
  if (s.contest === "salary") {
    field = buildSalaries(field, s.salary);
  } else {
    // Custom tiers start from world rank; the admin then moves golfers.
    const source = s.tiers.source === "custom" ? "rank" : s.tiers.source;
    if (source !== "rank" && !oddsByKey.size) return { error: "No DraftKings odds are stored for this major yet. Use world rank, or check the odds import." };
    field = buildTiers(field, s.tiers.sizes, source, 0.5);
  }
  const { error } = await ctx.supabase.rpc("golf_admin_save_field", { p_event_id: eventId, p_rows: field });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  const missing = field.filter((g) => g.world_rank === null).length;
  return { ok: `Field built: ${field.length} golfers${missing ? `, ${missing} outside the world top 300` : ""}.` };
}

/** Save the admin's edits to a major's field: [{espn_golfer_id, tier, salary}]. */
export async function saveMajorField(slug: string, eventId: string, edits: { espn_golfer_id: string; tier: number | null; salary: number | null }[]): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const { data: current } = await ctx.supabase.from("golf_field").select("espn_golfer_id, golfer_name, world_rank, odds, tier, salary").eq("event_id", eventId);
  if (!current?.length) return { error: "Build the field first." };
  const byId = new Map(edits.map((e) => [e.espn_golfer_id, e]));
  const rows = current.map((g) => {
    const e = byId.get(g.espn_golfer_id);
    return e ? { ...g, tier: e.tier, salary: e.salary } : g;
  });
  const { error } = await ctx.supabase.rpc("golf_admin_save_field", { p_event_id: eventId, p_rows: rows });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: "Field saved." };
}

export async function setMajorPicksOpen(slug: string, eventId: string, open: boolean, _?: ActionState, __?: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const { error } = await ctx.supabase.rpc("golf_admin_open_picks", { p_event_id: eventId, p_open: open });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  return { ok: open ? "Picks are open." : "Picks are closed." };
}
