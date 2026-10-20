"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import type { ActionState } from "@/components/ActionForm";
import { formatDuration } from "@/lib/format";
import { requireCommissioner } from "@/lib/pool";
import { LOCKED_AFTER_OPEN, parsePoolSettings, settingsError } from "@/lib/poolSettings";
import { slateWindow } from "@/lib/slateWindow";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyHalfPoint, parseSpread } from "@/lib/spread";

// Every action re-checks that the caller is this pool's commissioner; the database
// checks again (RLS / security definer functions).

const done = (slug: string, ok?: string): ActionState => {
  revalidatePath(`/p/${slug}`, "layout");
  return ok ? { ok } : null;
};

// ---------- Slates ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createSlate(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const startDate = String(form.get("start_date") ?? "");
  if (!ISO_DATE.test(startDate)) return { error: "Pick the first day of the week." };
  // Blank last day = the pool's usual window length.
  const endDate = String(form.get("end_date") ?? "") || undefined;
  if (endDate && !ISO_DATE.test(endDate)) return { error: "Pick the last day of the week." };
  let w: ReturnType<typeof slateWindow>;
  try {
    w = slateWindow(startDate, ctx.settings, endDate);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Check the first and last day." };
  }

  const { data: last } = await ctx.supabase
    .from("slates").select("week").eq("pool_id", ctx.pool.id).order("week", { ascending: false }).limit(1).maybeSingle();
  const week = (last?.week ?? 0) + 1;
  const label = String(form.get("label") ?? "").trim() || `Week ${week}`;

  const { error } = await ctx.supabase.from("slates").insert({
    pool_id: ctx.pool.id,
    week,
    label,
    window_start: w.window_start.toISOString(),
    window_end: w.window_end.toISOString(),
    lock_at: w.lock_at?.toISOString() ?? null,
    first_day_lock_at: w.first_day_lock_at?.toISOString() ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath(`/p/${slug}`, "layout");
  redirect(`/p/${slug}/admin/slate?week=${week}`);
}

/**
 * The draft's two weekly-mode deadlines, entered as datetime-local in the pool's time zone.
 * A blank first-day deadline means one deadline for every game. publish_slate turns these
 * into per-game deadlines (and rejects any that have passed).
 */
export async function saveDeadlines(slug: string, slateId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  if (ctx.settings.lock.mode !== "weekly") return { error: "This pool locks each game at its start." };
  const main = String(form.get("lock_at") ?? "");
  const firstDay = String(form.get("first_day_lock_at") ?? "");
  if (!main) return { error: "Set the deadline for everything else." };
  const lockAt = fromZonedTime(main, ctx.settings.timezone);
  const firstDayAt = firstDay ? fromZonedTime(firstDay, ctx.settings.timezone) : null;
  if (Number.isNaN(lockAt.getTime()) || (firstDayAt && Number.isNaN(firstDayAt.getTime()))) {
    return { error: "Enter a date and time for each deadline." };
  }
  // The first-day group is meant to lock first; equal is fine (Week 1: both Mon 3pm).
  if (firstDayAt && firstDayAt > lockAt) return { error: "The first-day deadline can't be after the main one." };

  const { data, error } = await ctx.supabase
    .from("slates")
    .update({ lock_at: lockAt.toISOString(), first_day_lock_at: firstDayAt?.toISOString() ?? null })
    .eq("id", slateId)
    .eq("status", "draft")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only a draft's deadlines can change." };
  return done(slug, "Deadlines saved.");
}

/** Give a TBD game its real tip time (datetime-local, pool time zone). Shared game row: every pool sees it. */
export async function setGameTime(slug: string, slateId: string, gameId: string, local: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  if (!local) return { error: "Enter the tip time." };
  const at = fromZonedTime(local, ctx.settings.timezone);
  if (Number.isNaN(at.getTime())) return { error: "Enter the tip time." };
  const { error } = await ctx.supabase.rpc("set_game_time", { p_slate_id: slateId, p_game_id: gameId, p_start_at: at.toISOString() });
  if (error) return { error: error.message };
  return done(slug);
}

export async function deleteSlate(slug: string, slateId: string) {
  const ctx = await requireCommissioner(slug);
  await ctx.supabase.from("slates").delete().eq("id", slateId).eq("status", "draft");
  revalidatePath(`/p/${slug}`, "layout");
  redirect(`/p/${slug}/admin/slate`);
}

/**
 * Adds games to a draft slate and, in ATS pools, saves each one's line right away: the value
 * typed in the editor if any, else the latest line from the pool's sportsbook (half-point
 * rule applied). Lines stay editable on the slate until publish.
 */
export async function addGames(slug: string, slateId: string, gameIds: string[], typed: Record<string, string> = {}): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const ats = ctx.settings.pick_type === "ats";
  const force = ctx.settings.lines.force_half_point;

  const spreadFor = new Map<string, { spread: number | null; lineId: number | null }>();
  if (ats) {
    for (const id of gameIds) {
      const raw = typed[id];
      if (raw === undefined || raw.trim() === "") continue;
      const parsed = parseSpread(raw);
      if ("error" in parsed) return { error: parsed.error };
      spreadFor.set(id, { spread: parsed.value, lineId: null });
    }
    const pull = gameIds.filter((id) => !spreadFor.has(id));
    if (pull.length) {
      const { data: lines } = await ctx.supabase
        .from("latest_game_lines")
        .select("id, game_id, home_spread")
        .eq("bookmaker", ctx.settings.lines.bookmaker)
        .in("game_id", pull);
      for (const l of lines ?? []) {
        if (l.home_spread === null || !l.game_id) continue;
        spreadFor.set(l.game_id, { spread: applyHalfPoint(Number(l.home_spread), force), lineId: l.id });
      }
    }
  }

  const { count } = await ctx.supabase.from("slate_games").select("*", { count: "exact", head: true }).eq("slate_id", slateId);
  const rows = gameIds.map((game_id, i) => ({
    slate_id: slateId,
    game_id,
    sort_order: (count ?? 0) + i,
    ...(ats && spreadFor.has(game_id)
      ? { locked_home_spread: spreadFor.get(game_id)!.spread, locked_line_id: spreadFor.get(game_id)!.lineId }
      : {}),
  }));
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
  const parsed = parseSpread(value);
  if ("error" in parsed) return { error: parsed.error };
  const spread = parsed.value;
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

/** Sync from today through the end of the latest draft week (at least 14 days, at most 30). */
export async function syncSchedule(slug: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { data: draft } = await ctx.supabase
    .from("slates").select("window_end").eq("pool_id", ctx.pool.id).eq("status", "draft")
    .order("window_end", { ascending: false }).limit(1).maybeSingle();
  const untilDraftEnd = draft ? Math.ceil((new Date(draft.window_end).getTime() - Date.now()) / 86_400_000) : 0;
  const days = Math.min(Math.max(14, untilDraftEnd), 30);

  const r = await invoke("sync-schedule", { sport: ctx.pool.sport, days });
  if ("error" in r) return { error: r.error };
  const s = r.data?.summary?.[ctx.pool.sport];
  return done(slug, `Schedule synced: ${s?.games ?? 0} games over the next ${days} days.`);
}

export async function refreshLines(slug: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const r = await invoke("sync-lines", { sport: ctx.pool.sport, bookmaker: ctx.settings.lines.bookmaker });
  if ("error" in r) return { error: r.error };
  const res = r.data?.results?.[0];
  // Lines are pulled at most once per sport per day to save API credits.
  if (res?.skipped) {
    const ago = res.last_pulled_at ? formatDuration(Date.now() - new Date(res.last_pulled_at).getTime()) : null;
    return done(
      slug,
      `Lines were already pulled today${ago ? ` (${ago} ago)` : ""} — the next pull is available tomorrow. ` +
        "You can still hand-edit any line before publishing.",
    );
  }
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
        return {
          error: "Pick type, pick count, confidence tiers and scoring for wrong picks, upsets and missed weeks can't change after the first week opens.",
        };
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

// ---------- Tournaments (champion picks) ----------

/** Add (no id) or edit a tournament: name, week, lock time (pool time zone), scoring and field. */
export async function saveTournament(slug: string, id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const name = String(form.get("name") ?? "").trim();
  const week = Number(form.get("week"));
  const lockLocal = String(form.get("lock_at") ?? "");
  const scoring = form.get("scoring") === "semifinals" ? "semifinals" : "third_place";
  const teamIds = form.getAll("team").map(String).filter(Boolean);
  if (!name) return { error: "Give the tournament a name." };
  if (!Number.isInteger(week) || week < 1) return { error: "Pick the week it belongs to." };
  const lockAt = lockLocal ? fromZonedTime(lockLocal, ctx.settings.timezone) : null;
  if (!lockAt || Number.isNaN(lockAt.getTime())) return { error: "Set when picks lock (the tournament's first tip)." };
  if (teamIds.length < 2) return { error: "Check at least two teams for the field." };
  const { error } = await ctx.supabase.rpc("save_tournament", {
    p_pool_id: ctx.pool.id,
    p_id: id,
    p_name: name,
    p_week: week,
    p_lock_at: lockAt.toISOString(),
    p_scoring: scoring,
    p_team_ids: teamIds,
  });
  if (error) return { error: error.message };
  return done(slug, id ? `${name} saved.` : `${name} added.`);
}

export async function deleteTournament(slug: string, id: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { error } = await ctx.supabase.rpc("delete_tournament", { p_id: id });
  if (error) return { error: error.message };
  return done(slug, "Tournament deleted.");
}

/** How the field finished: one select per team (place_<team id>), blank for no scoring place. */
export async function saveTournamentResults(slug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const placements: Record<string, string | null> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("place_")) placements[key.slice(6)] = String(value) || null;
  }
  const { error } = await ctx.supabase.rpc("set_tournament_results", { p_id: id, p_placements: placements });
  if (error) return { error: error.message };
  return done(slug, Object.values(placements).includes("champion") ? "Results saved; picks scored." : "Saved. Picks score once a champion is set.");
}
