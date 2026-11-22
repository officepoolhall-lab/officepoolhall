"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import type { ActionState } from "@/components/ActionForm";
import { formatDuration } from "@/lib/format";
import { requireCommissioner, requirePoolCommissioner } from "@/lib/pool";
import { LOCKED_AFTER_OPEN, parsePoolSettings, settingsError } from "@/lib/poolSettings";
import { slateWindow } from "@/lib/slateWindow";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyHalfPoint, parseSpread } from "@/lib/spread";
import { prunePicks } from "@/lib/bracket";
import { getBracket } from "@/lib/brackets";
import { espnBracketResults, saveTitleTotal } from "@/lib/bracketSync";
import { NFL_WEEKS, currentNflWeek, nflWeekLabel, nflWeekWindow } from "@/lib/nflWeeks";

// Every action re-checks that the caller is this pool's commissioner; the database
// checks again (RLS / security definer functions).

const done = (slug: string, ok?: string): ActionState => {
  revalidatePath(`/p/${slug}`, "layout");
  return ok ? { ok } : null;
};

// ---------- Slates ----------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * NFL pools: the next NFL week, with its own dates and every NFL game that week. The week
 * number is the NFL's (a pool started in Week 12 starts at Week 12), never chosen by hand.
 */
async function nextNflWeek(ctx: Awaited<ReturnType<typeof requireCommissioner>>): Promise<number | null> {
  const { data: last } = await ctx.supabase
    .from("slates").select("week").eq("pool_id", ctx.pool.id).order("week", { ascending: false }).limit(1).maybeSingle();
  const from = Math.max((last?.week ?? 0) + 1, currentNflWeek(ctx.pool.season));
  return NFL_WEEKS.find((w) => w >= from) ?? null;
}

/** Puts every NFL game in the slate's NFL week on it (only what's missing; lines as addGames). */
async function fillNflSlate(slug: string, ctx: Awaited<ReturnType<typeof requireCommissioner>>, slateId: string, week: number): Promise<ActionState> {
  const { start, end } = nflWeekWindow(ctx.pool.season, week);
  const [{ data: games }, { data: have }] = await Promise.all([
    ctx.supabase
      .from("games").select("id").eq("sport", "nfl")
      .gte("start_at", start.toISOString()).lt("start_at", end.toISOString())
      .not("status", "in", "(postponed,cancelled)")
      .order("start_at").limit(40),
    ctx.supabase.from("slate_games").select("game_id").eq("slate_id", slateId),
  ]);
  const on = new Set((have ?? []).map((r) => r.game_id));
  const add = (games ?? []).map((g) => g.id).filter((id) => !on.has(id));
  if (!add.length) return null;
  return addGames(slug, slateId, add);
}

export async function createSlate(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  if (ctx.pool.sport === "nfl") {
    const week = await nextNflWeek(ctx);
    if (week === null) return { error: "The NFL season is over." };
    const { start, end } = nflWeekWindow(ctx.pool.season, week);
    const { data: first } = await ctx.supabase
      .from("games").select("start_at").eq("sport", "nfl")
      .gte("start_at", start.toISOString()).lt("start_at", end.toISOString())
      .order("start_at").limit(1).maybeSingle();
    const { data: created, error } = await ctx.supabase
      .from("slates")
      .insert({
        pool_id: ctx.pool.id,
        week,
        label: nflWeekLabel(week),
        window_start: start.toISOString(),
        window_end: end.toISOString(),
        // Weekly-lock pools: the week's first kickoff. Per-game pools lock each game at kickoff.
        lock_at: ctx.settings.lock.mode === "weekly" ? (first?.start_at ?? null) : null,
        first_day_lock_at: null,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    const filled = await fillNflSlate(slug, ctx, created.id, week);
    if (filled?.error) return filled;
    revalidatePath(`/p/${slug}`, "layout");
    redirect(`/p/${slug}/admin/slate?week=${week}`);
  }
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

/**
 * Move an open (published) week's deadlines. Games already locked stay locked; the database
 * enforces that and that the new deadlines haven't passed.
 */
export async function updateOpenDeadlines(slug: string, slateId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  if (ctx.settings.lock.mode !== "weekly") return { error: "This pool locks each game at its start." };
  const main = String(form.get("lock_at") ?? "");
  const firstDay = String(form.get("first_day_lock_at") ?? "");
  if (!main) return { error: "Set the week's deadline." };
  const lockAt = fromZonedTime(main, ctx.settings.timezone);
  const firstDayAt = firstDay ? fromZonedTime(firstDay, ctx.settings.timezone) : null;
  if (Number.isNaN(lockAt.getTime()) || (firstDayAt && Number.isNaN(firstDayAt.getTime()))) {
    return { error: "Enter a date and time for each deadline." };
  }
  const { error } = await ctx.supabase.rpc("update_slate_deadlines", {
    p_slate_id: slateId,
    p_lock_at: lockAt.toISOString(),
    p_first_day_lock_at: firstDayAt?.toISOString() ?? null,
  });
  if (error) return { error: error.message };
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

/** Add a scheduled game to a week that's already published, while the week is open. */
export async function addOpenWeekGame(slug: string, slateId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  if (ctx.pool.sport === "nfl") return { error: "NFL weeks hold every game of the week automatically." };
  const gameId = String(form.get("game") ?? "");
  if (!gameId) return { error: "Choose a game." };
  let spread: number | null = null;
  if (ctx.settings.pick_type === "ats") {
    const parsed = parseSpread(String(form.get("spread") ?? ""));
    if ("error" in parsed) return { error: parsed.error };
    spread = parsed.value;
  }
  const { error } = await ctx.supabase.rpc("add_open_slate_game", { p_slate_id: slateId, p_game_id: gameId, p_home_spread: spread });
  if (error) return { error: error.message };
  return done(slug, "Game added to this week.");
}

export async function removeGame(slug: string, slateId: string, gameId: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  if (ctx.pool.sport === "nfl") return { error: "NFL weeks hold every game of the week." };
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

/** Sync from today: NFL the next 30 days; otherwise through the latest draft week (14 to 30 days). */
export async function syncSchedule(slug: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { data: draft } = await ctx.supabase
    .from("slates").select("window_end").eq("pool_id", ctx.pool.id).eq("status", "draft")
    .order("window_end", { ascending: false }).limit(1).maybeSingle();
  const untilDraftEnd = draft ? Math.ceil((new Date(draft.window_end).getTime() - Date.now()) / 86_400_000) : 0;
  // NFL: always the next 30 days (the schedule is set weeks ahead, and NFL weeks are made
  // automatically from it). Otherwise at least 14 days, through the latest draft week.
  const days = ctx.pool.sport === "nfl" ? 30 : Math.min(Math.max(14, untilDraftEnd), 30);

  const r = await invoke("sync-schedule", { sport: ctx.pool.sport, days });
  if ("error" in r) return { error: r.error };
  // NFL drafts hold every game of their week: add any the sync just brought in.
  if (ctx.pool.sport === "nfl") {
    const { data: drafts } = await ctx.supabase.from("slates").select("id, week").eq("pool_id", ctx.pool.id).eq("status", "draft");
    for (const d of drafts ?? []) {
      const f = await fillNflSlate(slug, ctx, d.id, d.week);
      if (f?.error) return f;
    }
  }
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

/** The roster page for football/basketball and for golf. */
const revalidateRoster = (slug: string) => {
  revalidatePath(`/p/${slug}/admin/roster`);
  revalidatePath(`/p/${slug}/golf/admin/roster`);
};

// Roster and invites work the same in every sport, so they use the sport-neutral check.

export async function setPaid(slug: string, userId: string, paid: boolean) {
  const ctx = await requirePoolCommissioner(slug);
  await ctx.supabase.from("pool_members").update({ paid }).eq("pool_id", ctx.pool.id).eq("user_id", userId);
  revalidateRoster(slug);
}

/** The commissioner's private note on a player (the Roster's Notes column). */
export async function setMemberNote(slug: string, userId: string, note: string) {
  const ctx = await requirePoolCommissioner(slug);
  const text = note.trim().slice(0, 300);
  const { error } = await ctx.supabase
    .from("pool_member_notes")
    .upsert({ pool_id: ctx.pool.id, user_id: userId, note: text, updated_at: new Date().toISOString() });
  if (error) return { ok: false as const, message: "Couldn't save the note." };
  return { ok: true as const };
}

/** Bench an entry: it sits out (no picks, out of the standings) but keeps its spot. */
export async function benchMember(slug: string, userId: string) {
  const ctx = await requirePoolCommissioner(slug);
  if (userId === ctx.user.id) return;
  await ctx.supabase.from("pool_member_bench").upsert({ pool_id: ctx.pool.id, user_id: userId });
  revalidateRoster(slug);
  revalidatePath(`/p/${slug}`, "layout");
}

/** Bring a benched entry back into the pool. */
export async function unbenchMember(slug: string, userId: string) {
  const ctx = await requirePoolCommissioner(slug);
  await ctx.supabase.from("pool_member_bench").delete().eq("pool_id", ctx.pool.id).eq("user_id", userId);
  revalidateRoster(slug);
  revalidatePath(`/p/${slug}`, "layout");
}

export async function removeMember(slug: string, userId: string) {
  const ctx = await requirePoolCommissioner(slug);
  if (userId === ctx.user.id) return;
  await ctx.supabase.from("pool_members").delete().eq("pool_id", ctx.pool.id).eq("user_id", userId);
  revalidateRoster(slug);
}

/** Replace the shareable invite link (the old one stops working). The guest link is separate. */
export async function rotateInvite(slug: string) {
  const ctx = await requirePoolCommissioner(slug);
  await ctx.supabase.from("invites").delete().eq("pool_id", ctx.pool.id).eq("guest", false);
  await ctx.supabase.from("invites").insert({ pool_id: ctx.pool.id });
  revalidateRoster(slug);
}

/** Create or replace the guest (view-only) link. */
export async function rotateGuestInvite(slug: string) {
  const ctx = await requirePoolCommissioner(slug);
  await ctx.supabase.from("invites").delete().eq("pool_id", ctx.pool.id).eq("guest", true);
  await ctx.supabase.from("invites").insert({ pool_id: ctx.pool.id, guest: true });
  revalidateRoster(slug);
}

/** Turn off the guest link (guests already in keep viewing until removed). */
export async function disableGuestInvite(slug: string) {
  const ctx = await requirePoolCommissioner(slug);
  await ctx.supabase.from("invites").delete().eq("pool_id", ctx.pool.id).eq("guest", true);
  revalidateRoster(slug);
}

export async function removeGuest(slug: string, userId: string) {
  const ctx = await requirePoolCommissioner(slug);
  await ctx.supabase.from("pool_guests").delete().eq("pool_id", ctx.pool.id).eq("user_id", userId);
  revalidateRoster(slug);
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
  const rawScoring = String(form.get("scoring") ?? "");
  const scoring = rawScoring === "semifinals" || rawScoring === "champion_only" ? rawScoring : "third_place";
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

// ---------- NCAA Tournament bracket ----------

/**
 * Create (no id) or edit the bracket: name, week, lock time (pool time zone), four region names
 * (Final Four order) and 64 teams typed by name as team_<slot>. Names match the pool's teams by
 * full name, short name or abbreviation (ignoring case).
 */
export async function saveBracket(slug: string, id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const name = String(form.get("name") ?? "").trim() || "NCAA Tournament";
  const week = Number(form.get("week"));
  const lockLocal = String(form.get("lock_at") ?? "");
  const regions = [0, 1, 2, 3].map((i) => String(form.get(`region_${i}`) ?? "").trim());
  if (!Number.isInteger(week) || week < 1) return { error: "Pick the week it belongs to." };
  const lockAt = lockLocal ? fromZonedTime(lockLocal, ctx.settings.timezone) : null;
  if (!lockAt || Number.isNaN(lockAt.getTime())) return { error: "Set when brackets lock (the first-round tip)." };
  if (regions.some((r) => !r)) return { error: "Name all four regions." };

  const { data: teams } = await ctx.supabase.from("teams").select("id, name, short_name, abbreviation").eq("sport", ctx.pool.sport);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();
  const byName = new Map<string, string[]>();
  for (const t of teams ?? []) {
    for (const n of [t.name, t.short_name, t.abbreviation]) {
      if (!n) continue;
      const k = norm(n);
      byName.set(k, [...new Set([...(byName.get(k) ?? []), t.id])]);
    }
  }
  const ids: string[] = [];
  const unknown: string[] = [];
  const ambiguous: string[] = [];
  for (let slot = 0; slot < 64; slot++) {
    const typed = String(form.get(`team_${slot}`) ?? "").trim();
    if (!typed) return { error: `Fill in all 64 teams (${regions[Math.floor(slot / 16)] || `region ${Math.floor(slot / 16) + 1}`} is missing one).` };
    const match = byName.get(norm(typed)) ?? [];
    if (match.length === 1) ids.push(match[0]);
    else (match.length ? ambiguous : unknown).push(typed);
  }
  if (unknown.length) return { error: `Not a team we know: ${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? "…" : ""}. Pick names from the list.` };
  if (ambiguous.length) return { error: `More than one team matches: ${ambiguous.slice(0, 6).join(", ")}. Use the full name.` };

  const { error } = await ctx.supabase.rpc("save_bracket", {
    p_pool_id: ctx.pool.id,
    p_id: id,
    p_name: name,
    p_week: week,
    p_lock_at: lockAt.toISOString(),
    p_regions: regions,
    p_team_ids: ids,
  });
  if (error) return { error: error.message };
  return done(slug, id ? "Bracket saved." : "Bracket created. Players can fill theirs out now.");
}

export async function deleteBracket(slug: string, id: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const { error } = await ctx.supabase.rpc("delete_bracket", { p_id: id });
  if (error) return { error: error.message };
  return done(slug, "Bracket deleted.");
}

/** Winners so far: one select per game (result_<round>-<game>), blank for not played. */
export async function saveBracketResults(slug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const results: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("result_") && value) results[key.slice(7)] = String(value);
  }
  // Changing an earlier winner drops later winners that no longer fit, rather than failing.
  const bracket = await getBracket(ctx);
  const clean = bracket && bracket.id === id ? prunePicks(results, bracket.field.map((t) => t?.id ?? null)) : results;
  const { error } = await ctx.supabase.rpc("set_bracket_results", { p_id: id, p_results: clean });
  if (error) return { error: error.message };
  return done(slug, "Results saved; every bracket re-scored.");
}

/** Fill in winners from ESPN's finished games (never changes one already set). Also runs by itself every 15 minutes during the tournament. */
export async function syncBracketResults(slug: string, id: string): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const bracket = await getBracket(ctx);
  if (!bracket || bracket.id !== id) return { error: "Bracket not found." };
  const sync = await espnBracketResults(bracket);
  if (sync.added) {
    const { error } = await ctx.supabase.rpc("set_bracket_results", { p_id: id, p_results: sync.results });
    if (error) return { error: error.message };
  }
  // Pick X's tiebreaker: the title game's total, once it's final.
  const total = await saveTitleTotal(ctx.supabase, ctx.pool, sync.titleTotal);
  if (!sync.added && !total) return { ok: "Nothing new from ESPN: no finished games are waiting for a winner." };
  return done(slug, `${sync.added} winner${sync.added === 1 ? "" : "s"} added from ESPN${total ? "; the title game's total is in" : ""}. Everything re-scored.`);
}

// ---------- Imported entries: real names and emails ----------

/** A placeholder address from an import (…@something.invalid): nobody can sign in with it. */
const isPlaceholder = (email: string | null | undefined) => Boolean(email && /\.invalid$/i.test(email));

/**
 * Emails one sign-in code/link to the person, from a fresh client with no session, so it
 * doesn't touch the commissioner's own sign-in. Never creates an account (it was just set).
 */
async function sendSignInEmail(email: string, slug: string): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(`/p/${slug}`)}` },
  });
  if (error) console.error("Roster: sign-in email not sent", email, error.message);
  return !error;
}

/** Give one imported entry its owner's email (and name); see assign_entry_email. */
export async function assignEntryEmail(slug: string, userId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const first = String(form.get("first_name") ?? "").trim();
  const last = String(form.get("last_name") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  const { data, error } = await ctx.supabase.rpc("assign_entry_email", {
    p_pool_id: ctx.pool.id,
    p_user_id: userId,
    p_email: email,
    p_first_name: first || undefined,
    p_last_name: last || undefined,
  });
  if (error) return { error: error.message };
  const sent = form.get("send") === "on" ? await sendSignInEmail(email, slug) : null;
  const what = data === "merged" ? `Moved onto ${email}'s account` : `Added ${email}`;
  return done(slug, `${what}.${sent === true ? " Sign-in email sent." : sent === false ? " The sign-in email didn't send; they can sign in on the site with that address." : ""}`);
}

/**
 * Many at once, one per line: "name on the site, real name, email" (commas or tabs; the real
 * name may be left out). The name on the site is how the entry shows now, e.g. "JP21" or
 * "JP21 (Entry 2)". Lines that fail are listed; the rest go through.
 */
export async function assignEntryEmails(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const send = form.get("send") === "on";
  const lines = String(form.get("lines") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { error: "Paste one entry per line: name on the site, real name, email." };

  const [{ data: members }, { data: accounts }] = await Promise.all([
    ctx.supabase.from("pool_members").select("user_id, profile:profiles!inner ( display_name )").eq("pool_id", ctx.pool.id),
    ctx.supabase.rpc("pool_member_emails", { p_pool_id: ctx.pool.id }),
  ]);
  const emailOf = new Map<string, string>(((accounts ?? []) as { user_id: string; email: string }[]).map((a) => [a.user_id, a.email]));
  const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const byName = new Map<string, string>();
  for (const m of (members ?? []) as { user_id: string; profile: { display_name: string } }[]) {
    if (isPlaceholder(emailOf.get(m.user_id))) byName.set(key(m.profile.display_name), m.user_id);
  }

  const failed: string[] = [];
  let added = 0;
  let mailed = 0;
  for (const line of lines) {
    const parts = line.split(/\t|,/).map((p) => p.trim());
    const email = parts.find((p) => /^\S+@\S+\.\S+$/.test(p))?.toLowerCase();
    const site = parts[0];
    const real = parts.length >= 3 ? parts[1] : "";
    const userId = byName.get(key(site));
    if (!email) {
      failed.push(`${line}: no email`);
      continue;
    }
    if (!userId) {
      failed.push(`${site}: no unclaimed entry by that name`);
      continue;
    }
    const [first, ...rest] = real.split(/\s+/).filter(Boolean);
    const { error } = await ctx.supabase.rpc("assign_entry_email", {
      p_pool_id: ctx.pool.id,
      p_user_id: userId,
      p_email: email,
      p_first_name: first || undefined,
      p_last_name: rest.join(" ") || undefined,
    });
    if (error) {
      failed.push(`${site}: ${error.message}`);
      continue;
    }
    byName.delete(key(site));
    added++;
    if (send && (await sendSignInEmail(email, slug))) mailed++;
  }
  revalidatePath(`/p/${slug}`, "layout");
  const ok = `${added} of ${lines.length} added${send ? ` · ${mailed} sign-in email${mailed === 1 ? "" : "s"} sent` : ""}.`;
  return failed.length ? { error: `${ok} Not added: ${failed.join("; ")}` } : { ok };
}
