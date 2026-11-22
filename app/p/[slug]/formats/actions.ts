"use server";

import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import type { ActionState } from "@/components/ActionForm";
import { poolFormat } from "@/lib/formats";
import { pfSettings, pfSettingsError, rosterSize } from "@/lib/playoffFantasy";
import { setupFromEspn } from "@/lib/playoffFantasyData";
import { getPoolBase, requireCommissioner, requirePoolCommissioner } from "@/lib/pool";
import { squaresSettings, squaresSettingsError } from "@/lib/squares";
import { survivorSettings, survivorSettingsError } from "@/lib/survivor";

// Server actions for the Survivor, Squares and Playoff Fantasy pools. Every commissioner
// action re-checks the caller; the database checks again (RLS / security definer functions).

/* eslint-disable @typescript-eslint/no-explicit-any -- the new tables' typed rows live in the database functions */
type Db = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
const dbOf = (ctx: { supabase: unknown }) => ctx.supabase as Db;

const refresh = (slug: string) => revalidatePath(`/p/${slug}`, "layout");

// ---------- Settings (every format) ----------

/** The pool's name and fee, and its format's rules (the form's `rules` field, JSON). */
export async function saveFormatSettings(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireCommissioner(slug);
  const format = poolFormat(ctx.pool.settings);
  if (format !== "survivor" && format !== "squares" && format !== "playoff_fantasy") return { error: "This pool's rules are set elsewhere." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "The pool needs a name." };
  const fee = Number(form.get("entry_fee") || 0);
  if (!Number.isFinite(fee) || fee < 0) return { error: "The entry fee must be 0 or more." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("rules")));
  } catch {
    return { error: "The rules are missing." };
  }

  let rules: unknown;
  let problem: string | null;
  if (format === "survivor") {
    const s = survivorSettings({ survivor: raw });
    [rules, problem] = [s, survivorSettingsError(s)];
  } else if (format === "squares") {
    const s = squaresSettings({ squares: raw });
    [rules, problem] = [s, squaresSettingsError(s)];
  } else {
    const s = pfSettings({ playoff_fantasy: raw });
    // The lock time comes from its own field, in the pool's time zone.
    const local = String(form.get("lock_at_local") ?? "").trim();
    const before = pfSettings(ctx.pool.settings);
    s.lock_at = local ? fromZonedTime(local, ctx.settings.timezone).toISOString() : null;
    if (local && Number.isNaN(Date.parse(s.lock_at!))) return { error: "That lock time isn't a date." };
    // Once rosters have locked, the spots stay as they were (everyone built to them).
    if (before.lock_at && Date.parse(before.lock_at) <= Date.now()) s.roster = before.roster;
    [rules, problem] = [s, pfSettingsError(s)];
  }
  if (problem) return { error: problem };

  const settings = { ...((ctx.pool.settings as Record<string, unknown> | null) ?? {}), format, [format]: rules };
  const { error } = await ctx.supabase.from("pools").update({ name, entry_fee: fee, settings: settings as never }).eq("id", ctx.pool.id);
  if (error) return { error: error.message };
  refresh(slug);
  return { ok: "Settings saved." };
}

// ---------- Survivor ----------

/** Make or move the week's pick (the database checks the lock, the team and the lives). */
export async function saveSurvivorPick(slug: string, slateId: string, forUserId: string | null, gameId: string, teamId: string): Promise<{ error?: string }> {
  const ctx = await getPoolBase(slug);
  const { error } = await dbOf(ctx).rpc("submit_survivor_pick", { p_slate_id: slateId, p_game_id: gameId, p_team_id: teamId, p_user_id: forUserId ?? ctx.entryUserId });
  if (error) return { error: error.message };
  refresh(slug);
  return {};
}

// ---------- Squares ----------

/** Put a name on a square (the database checks who may, the limit and the lock). */
export async function claimSquare(slug: string, idx: number, name: string): Promise<{ error?: string }> {
  const ctx = await getPoolBase(slug);
  const { error } = await dbOf(ctx).rpc("claim_square", { p_pool_id: ctx.pool.id, p_idx: idx, p_label: name });
  refresh(slug);
  return error ? { error: error.message } : {};
}

export async function releaseSquare(slug: string, idx: number): Promise<{ error?: string }> {
  const ctx = await getPoolBase(slug);
  const { error } = await dbOf(ctx).rpc("release_square", { p_pool_id: ctx.pool.id, p_idx: idx });
  refresh(slug);
  return error ? { error: error.message } : {};
}

/** Set the numbers the pool's way (a random draw, or 0-9 in order), which locks the board; or clear them to reopen it. */
export async function drawSquares(slug: string, clear: boolean): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const { error } = await dbOf(ctx).rpc("squares_draw", { p_pool_id: ctx.pool.id, p_clear: clear });
  if (error) return { error: error.message };
  refresh(slug);
  return { ok: clear ? "Numbers cleared. The board is open again." : "Numbers set. The board is locked." };
}

/** Numbers typed in by the commissioner: the form's col_0…col_9 and row_0…row_9. */
export async function typeSquaresNumbers(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  const read = (side: string) => Array.from({ length: 10 }, (_, i) => String(form.get(`${side}_${i}`) ?? "").trim());
  const [cols, rows] = [read("col"), read("row")];
  if ([...cols, ...rows].some((v) => !/^\d$/.test(v))) return { error: "Fill in all 20 boxes with a digit from 0 to 9." };
  const { error } = await dbOf(ctx).rpc("squares_draw", { p_pool_id: ctx.pool.id, p_clear: false, p_cols: cols.map(Number), p_rows: rows.map(Number) });
  if (error) return { error: error.message };
  refresh(slug);
  return { ok: "Numbers set. The board is locked." };
}

/** The board's game (the Super Bowl by itself, or one chosen from this week's), its stand-in team names, and any scores typed in by hand. */
export async function saveSquaresBoard(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  if (poolFormat(ctx.pool.settings) !== "squares") return { error: "This isn't a Squares pool." };
  const home = String(form.get("home_name") ?? "").trim().slice(0, 30) || "NFC";
  const away = String(form.get("away_name") ?? "").trim().slice(0, 30) || "AFC";
  const game = String(form.get("game") ?? "").trim();
  if (game && !/^\d{6,}$/.test(game)) return { error: "Choose a game from the list." };
  const scores: Record<string, [number, number]> = {};
  for (const q of [1, 2, 3, 4]) {
    const h = String(form.get(`home_${q}`) ?? "").trim();
    const a = String(form.get(`away_${q}`) ?? "").trim();
    if (!h && !a) continue;
    if (!/^\d{1,3}$/.test(h) || !/^\d{1,3}$/.test(a)) return { error: "Enter both teams' scores for a quarter, or leave both blank." };
    scores[String(q)] = [Number(h), Number(a)];
  }
  const { error } = await dbOf(ctx)
    .from("squares_boards")
    .upsert({ pool_id: ctx.pool.id, home_name: home, away_name: away, game_espn_id: game || null, scores, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  refresh(slug);
  return { ok: "Board saved." };
}

// ---------- Playoff Fantasy ----------

/** Save a roster (the database checks the spots, one player per team, and the lock). */
export async function savePfLineup(slug: string, forUserId: string | null, playerIds: string[]): Promise<{ error?: string }> {
  const ctx = await getPoolBase(slug);
  const { error } = await dbOf(ctx).rpc("submit_pf_lineup", { p_pool_id: ctx.pool.id, p_player_ids: playerIds, p_user_id: forUserId ?? ctx.entryUserId });
  if (error) return { error: error.message };
  refresh(slug);
  return {};
}

/** Which teams made the playoffs (the form's ticked `team` boxes). Players of a team taken off the list go too. */
export async function savePfTeams(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  if (poolFormat(ctx.pool.settings) !== "playoff_fantasy") return { error: "This isn't a Playoff Fantasy pool." };
  const s = pfSettings(ctx.pool.settings);
  if (s.lock_at && Date.parse(s.lock_at) <= Date.now()) return { error: "Rosters have locked, so the playoff teams can't change." };
  const ids = [...new Set(form.getAll("team").map(String))];
  if (ids.length > 14) return { error: `${ids.length} teams are ticked; 14 make the playoffs.` };
  const db = dbOf(ctx);
  const { data: current } = await db.from("pf_teams").select("team_id").eq("pool_id", ctx.pool.id);
  const had = new Set(((current ?? []) as { team_id: string }[]).map((r) => r.team_id));
  const drop = [...had].filter((id) => !ids.includes(id));
  if (drop.length) {
    await db.from("pf_players").delete().eq("pool_id", ctx.pool.id).in("team_id", drop);
    const { error } = await db.from("pf_teams").delete().eq("pool_id", ctx.pool.id).in("team_id", drop);
    if (error) return { error: error.message };
  }
  const add = ids.filter((id) => !had.has(id));
  if (add.length) {
    const { error } = await db.from("pf_teams").insert(add.map((team_id) => ({ pool_id: ctx.pool.id, team_id })));
    if (error) return { error: error.message };
  }
  refresh(slug);
  const need = rosterSize(s);
  if (ids.length < need) return { ok: `Saved ${ids.length} teams. Rosters have ${need} spots, so ${need - ids.length} more are needed.` };
  // Their players load straight away.
  const r = await setupFromEspn(ctx.pool, true);
  refresh(slug);
  return r.ok ? { ok: `Saved ${ids.length} playoff teams. ${r.message}` } : { error: `Saved the teams, but: ${r.message}` };
}

/**
 * Load (or refresh) the playoff teams and their players from ESPN. `byHand`: keep the teams the
 * commissioner ticked and only refresh their players.
 */
export async function loadPfPlayers(slug: string, byHand: boolean): Promise<ActionState> {
  const ctx = await requirePoolCommissioner(slug);
  if (poolFormat(ctx.pool.settings) !== "playoff_fantasy") return { error: "This isn't a Playoff Fantasy pool." };
  const s = pfSettings(ctx.pool.settings);
  if (!byHand && s.lock_at && Date.parse(s.lock_at) <= Date.now()) return { error: "Rosters have locked, so the playoff teams can't change." };
  const r = await setupFromEspn(ctx.pool, byHand);
  refresh(slug);
  return r.ok ? { ok: r.message } : { error: r.message };
}
