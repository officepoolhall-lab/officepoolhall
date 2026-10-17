"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import type { ActionState } from "@/components/ActionForm";
import { requireCommissioner } from "@/lib/pool";
import { LOCKED_AFTER_OPEN, parsePoolSettings, settingsError } from "@/lib/poolSettings";
import { slateWindow } from "@/lib/slateWindow";
import { createAdminClient } from "@/lib/supabase/admin";

// Every action re-checks that the caller is this pool's commissioner; the database
// checks again (RLS / security definer functions).

const done = (slug: string, ok?: string): ActionState => {
  revalidatePath(`/p/${slug}`, "layout");
  return ok ? { ok } : null;
};

// ---------- Slates ----------

export async function createSlate(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const startDate = String(form.get("start_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "Pick the first day of the week." };

  const { data: last } = await ctx.supabase
    .from("slates").select("week").eq("pool_id", ctx.pool.id).order("week", { ascending: false }).limit(1).maybeSingle();
  const week = (last?.week ?? 0) + 1;
  const label = String(form.get("label") ?? "").trim() || `Week ${week}`;
  const w = slateWindow(startDate, ctx.settings);

  const { error } = await ctx.supabase.from("slates").insert({
    pool_id: ctx.pool.id,
    week,
    label,
    window_start: w.window_start.toISOString(),
    window_end: w.window_end.toISOString(),
    lock_at: w.lock_at?.toISOString() ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  redirect(`/p/${slug}/admin/slate?week=${week}`);
}

export async function deleteSlate(slug: string, slateId: string) {
  const ctx = await requireCommissioner(slug);
  await ctx.supabase.from("slates").delete().eq("id", slateId).eq("status", "draft");
  revalidatePath(`/p/${slug}`, "layout");
  redirect(`/p/${slug}/admin/slate`);
}

export async function addGames(slug: string, slateId: string, gameIds: string[]): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { count } = await ctx.supabase.from("slate_games").select("*", { count: "exact", head: true }).eq("slate_id", slateId);
  const rows = gameIds.map((game_id, i) => ({ slate_id: slateId, game_id, sort_order: (count ?? 0) + i }));
  const { error } = await ctx.supabase.from("slate_games").upsert(rows, { onConflict: "slate_id,game_id", ignoreDuplicates: true });
  if (error) return { error: error.message };
  return done(slug, `Added ${gameIds.length} game${gameIds.length === 1 ? "" : "s"}.`);
}

export async function removeGame(slug: string, slateId: string, gameId: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { error } = await ctx.supabase.from("slate_games").delete().eq("slate_id", slateId).eq("game_id", gameId);
  if (error) return { error: error.message };
  return done(slug);
}

/** Hand-edit a frozen line while the slate is a draft. Empty clears it. */
export async function setSpread(slug: string, slateId: string, gameId: string, value: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const trimmed = value.trim().replace("−", "-");
  const spread = trimmed === "" ? null : /^pk$/i.test(trimmed) ? 0 : Number(trimmed);
  if (spread !== null && (!Number.isFinite(spread) || Math.abs(spread) > 99 || (spread * 2) % 1 !== 0)) {
    return { error: "Spreads are whole or half points, e.g. -3.5 (home favored) or 7." };
  }
  const { error } = await ctx.supabase
    .from("slate_games")
    .update({ locked_home_spread: spread, locked_line_id: null })
    .eq("slate_id", slateId)
    .eq("game_id", gameId);
  if (error) return { error: error.message };
  return done(slug);
}

export async function freezeLines(slug: string, slateId: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { error } = await ctx.supabase.rpc("freeze_slate_lines", { p_slate_id: slateId });
  if (error) return { error: error.message };
  return done(slug, "Lines copied from the latest pull. Review, then publish.");
}

export async function publishSlate(slug: string, slateId: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { error } = await ctx.supabase.rpc("publish_slate", { p_slate_id: slateId });
  if (error) return { error: error.message };
  return done(slug, "Published. Players can pick now.");
}

// ---------- Ingestion (Edge Functions, service role) ----------

async function invoke(name: string, body: Record<string, unknown>) {
  const { data, error } = await createAdminClient().functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    try {
      detail = (await error.context?.json())?.error ?? detail;
    } catch {}
    return { error: `${name}: ${detail}` };
  }
  return { data };
}

export async function syncSchedule(slug: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const r = await invoke("sync-schedule", { sport: ctx.pool.sport, days: 14 });
  if ("error" in r) return { error: r.error };
  const s = r.data?.summary?.[ctx.pool.sport];
  return done(slug, `Schedule synced: ${s?.games ?? 0} games over the next 14 days.`);
}

export async function refreshLines(slug: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const r = await invoke("sync-lines", { sport: ctx.pool.sport, bookmaker: ctx.settings.lines.bookmaker });
  if ("error" in r) return { error: r.error };
  const res = r.data?.results?.[0];
  return done(
    slug,
    `Pulled ${res?.lines ?? 0} lines from ${ctx.settings.lines.bookmaker}` +
      (res?.unmatched ? ` · ${res.unmatched} unmatched team names (see below)` : "") +
      (res?.quota_remaining ? ` · ${res.quota_remaining} API credits left` : ""),
  );
}

export async function resolveTeamMatch(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { error } = await ctx.supabase.rpc("resolve_team_match", {
    p_queue_id: Number(form.get("queue_id")),
    p_team_id: String(form.get("team_id")),
  });
  if (error) return { error: error.message };
  return done(slug, "Matched. Refresh lines to pick it up.");
}

export async function addManualGame(slug: string, slateId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const home = String(form.get("home") ?? "");
  const away = String(form.get("away") ?? "");
  const local = String(form.get("start") ?? ""); // datetime-local, in the pool's time zone
  if (!home || !away || !local) return { error: "Pick both teams and a start time." };

  const { data: gameId, error } = await ctx.supabase.rpc("add_manual_game", {
    p_pool_id: ctx.pool.id,
    p_home_team_id: home,
    p_away_team_id: away,
    p_start_at: fromZonedTime(local, ctx.settings.timezone).toISOString(),
    p_neutral_site: form.get("neutral") === "on",
    p_tv_network: String(form.get("tv") ?? "").trim() || undefined,
  });
  if (error) return { error: error.message };
  await ctx.supabase.from("slate_games").insert({ slate_id: slateId, game_id: gameId });
  return done(slug, "Game added to the slate.");
}

// ---------- Results ----------

export async function overrideResult(slug: string, slateId: string, gameId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const clear = form.get("clear") === "1";
  const home = Number(form.get("home"));
  const away = Number(form.get("away"));
  if (!clear && (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)) {
    return { error: "Enter both scores." };
  }
  const { error } = await ctx.supabase.rpc("set_result_override", {
    p_slate_id: slateId,
    p_game_id: gameId,
    p_home_score: clear ? null : home,
    p_away_score: clear ? null : away,
  } as never); // nulls clear the override; generated types don't mark these args nullable
  if (error) return { error: error.message };
  return done(slug, clear ? "Override cleared; using the feed's score." : "Result saved; standings recomputed.");
}

export async function setVoided(slug: string, slateId: string, gameId: string, voided: boolean): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { error } = await ctx.supabase.rpc("void_game", { p_slate_id: slateId, p_game_id: gameId, p_voided: voided });
  if (error) return { error: error.message };
  return done(slug, voided ? "Game voided (0 points for everyone)." : "Game restored.");
}

// ---------- Roster ----------

export async function setPaid(slug: string, userId: string, paid: boolean) {
  const ctx = await requireCommissioner(slug);
  await ctx.supabase.from("pool_members").update({ paid }).eq("pool_id", ctx.pool.id).eq("user_id", userId);
  revalidatePath(`/p/${slug}/admin/roster`);
}

export async function removeMember(slug: string, userId: string) {
  const ctx = await requireCommissioner(slug);
  if (userId === ctx.user.id) return;
  await ctx.supabase.from("pool_members").delete().eq("pool_id", ctx.pool.id).eq("user_id", userId);
  revalidatePath(`/p/${slug}/admin/roster`);
}

/** Replace the shareable invite link (the old one stops working). */
export async function rotateInvite(slug: string) {
  const ctx = await requireCommissioner(slug);
  await ctx.supabase.from("invites").delete().eq("pool_id", ctx.pool.id);
  await ctx.supabase.from("invites").insert({ pool_id: ctx.pool.id });
  revalidatePath(`/p/${slug}/admin/roster`);
}

// ---------- Settings ----------

export async function saveSettings(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("settings")));
  } catch {
    return { error: "Settings are missing." };
  }
  const parsed = parsePoolSettings(raw);
  if (!parsed.success) return { error: settingsError(raw) ?? "Invalid settings." };

  const { count } = await ctx.supabase
    .from("slates").select("*", { count: "exact", head: true }).eq("pool_id", ctx.pool.id).neq("status", "draft");
  if (count) {
    for (const key of LOCKED_AFTER_OPEN) {
      if (JSON.stringify(parsed.data[key]) !== JSON.stringify(ctx.settings[key])) {
        return { error: "Pick type, pick count and tiers can't change after the first week opens." };
      }
    }
  }

  const name = String(form.get("name") ?? "").trim();
  const { error } = await ctx.supabase
    .from("pools")
    .update({ name: name || ctx.pool.name, entry_fee: Number(form.get("entry_fee") || 0), settings: parsed.data })
    .eq("id", ctx.pool.id);
  if (error) return { error: error.message };
  return done(slug, "Settings saved.");
}
