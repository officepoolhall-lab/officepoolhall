"use server";

import { after } from "next/server";
import { syncNflSeason } from "@/lib/nflSchedule";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { parsePoolSettings, settingsError } from "@/lib/poolSettings";
import { pickXSettings, pickXSettingsError } from "@/lib/pickx";
import { survivorSettings, survivorSettingsError } from "@/lib/survivor";
import { squaresSettings, squaresSettingsError } from "@/lib/squares";
import { pfSettings, pfSettingsError } from "@/lib/playoffFantasy";
import { createClient } from "@/lib/supabase/server";
import { notifyCreator } from "@/lib/notify";
import type { Json } from "@/lib/database.types";

export async function createPool(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser("/pools/new");
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase();
  const sport = String(form.get("sport") ?? "");
  const season = Number(form.get("season"));
  const entryFee = Number(form.get("entry_fee") || 0);

  if (!name) return { error: "Give the pool a name." };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { error: "The URL name can only use lowercase letters, numbers, and dashes." };
  if (sport === "pga") return createMajorsPool({ name, slug, season, entryFee, form });
  if (sport !== "ncaab" && sport !== "ncaaf" && sport !== "nfl") return { error: "Pick a sport." };
  if (!Number.isInteger(season) || season < 2020) return { error: "Enter the season's starting year." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("settings")));
  } catch {
    return { error: "Settings are missing." };
  }
  const parsed = parsePoolSettings(raw);
  if (!parsed.success) return { error: settingsError(raw) ?? "Invalid settings." };

  // NCAA Pick X: the same college basketball pool, with its own format and rules.
  let settings: Record<string, unknown> = parsed.data;
  if (form.get("pick_x")) {
    if (sport !== "ncaab") return { error: "Pick X is a college basketball pool." };
    let rules: unknown;
    try {
      rules = JSON.parse(String(form.get("pick_x")));
    } catch {
      return { error: "The Pick X rules are missing." };
    }
    const pick_x = pickXSettings({ pick_x: rules });
    const problem = pickXSettingsError(pick_x);
    if (problem) return { error: problem };
    settings = { ...parsed.data, format: "pick_x", pick_x };
  }

  // Survivor, Squares and Playoff Fantasy: an NFL pool with its own format and rules.
  const format = String(form.get("format") ?? "");
  if (format) {
    if (sport !== "nfl" && !(sport === "ncaaf" && format === "squares")) return { error: "That's an NFL pool." };
    let rules: unknown;
    try {
      rules = JSON.parse(String(form.get("rules")));
    } catch {
      return { error: "The rules are missing." };
    }
    if (format === "survivor") {
      const r = survivorSettings({ survivor: rules });
      const problem = survivorSettingsError(r);
      if (problem) return { error: problem };
      settings = { ...parsed.data, format, survivor: r };
    } else if (format === "squares") {
      const r = squaresSettings({ squares: rules });
      const problem = squaresSettingsError(r);
      if (problem) return { error: problem };
      settings = { ...parsed.data, format, squares: r };
    } else if (format === "playoff_fantasy") {
      const r = pfSettings({ playoff_fantasy: rules });
      const problem = pfSettingsError(r);
      if (problem) return { error: problem };
      settings = { ...parsed.data, format, playoff_fantasy: r };
    } else {
      return { error: "Unknown pool type." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_pool", {
    p_name: name,
    p_slug: slug,
    p_sport: sport,
    p_season: season,
    p_entry_fee: entryFee,
    p_settings: settings as Json,
  });
  if (error) {
    return { error: error.code === "23505" ? "That URL name is taken; try another." : error.message };
  }
  // A new NFL pool: make sure the whole season's schedule is loaded (after the page answers).
  if (sport === "nfl") after(() => syncNflSeason(season).then(() => undefined));
  redirect(`/p/${slug}/admin/roster`);
}

/**
 * A golf majors pool: all four majors, one of them, or one regular PGA Tour event. The chosen majors are added with ESPN's
 * tournament ids for the season (when known); the rest of the setup is in the pool's Admin.
 */
async function createMajorsPool({ name, slug, season, entryFee, form }: { name: string; slug: string; season: number; entryFee: number; form: FormData }): Promise<ActionState> {
  const { MAJORS, MAJOR_ESPN_IDS } = await import("@/lib/golfMajors");
  if (!Number.isInteger(season) || season < 2026) return { error: "Enter the year of the majors (2027 for next season)." };
  const scope = String(form.get("majors_scope") ?? "all");
  const contest = form.get("majors_contest") === "salary" ? "salary" : "tiers";

  // One regular PGA Tour event (a demo or a one-off pool): ESPN's tournament id and its name.
  if (scope === "event") {
    const espnId = String(form.get("event_espn_id") ?? "").trim().match(/(\d{6,})/)?.[1] ?? "";
    const eventName = String(form.get("event_name") ?? "").trim();
    if (!espnId) return { error: "Enter the tournament's ESPN id (the number at the end of its ESPN leaderboard link)." };
    if (!eventName) return { error: "Enter the tournament's name." };
    const supabase = await createClient();
    const { data: poolId, error } = await supabase.rpc("create_pool", {
      p_name: name,
      p_slug: slug,
      p_sport: "pga",
      p_season: season,
      p_entry_fee: entryFee,
      p_settings: { golf_format: "majors", majors: { contest, standings: "cumulative", scope: "event" } },
    });
    if (error) return { error: error.code === "23505" ? "That URL name is taken; try another." : error.message };
    if (poolId) {
      const { error: addError } = await supabase.rpc("golf_admin_add_major", { p_pool_id: poolId, p_major: "event", p_espn_id: espnId, p_name: eventName });
      if (addError) return { error: `The pool was made, but the tournament wasn't added: ${addError.message} Add it on the pool's Commissioner → Tournaments page.` };
    }
    redirect(`/p/${slug}/golf/admin/tournaments`);
  }

  const majors = scope === "all" ? MAJORS : MAJORS.filter((m) => m.id === scope);
  if (!majors.length) return { error: "Choose All Majors or one major." };

  const supabase = await createClient();
  const { data: poolId, error } = await supabase.rpc("create_pool", {
    p_name: name,
    p_slug: slug,
    p_sport: "pga",
    p_season: season,
    p_entry_fee: entryFee,
    p_settings: { golf_format: "majors", majors: { contest, standings: "cumulative", scope: scope === "all" ? "all" : majors[0].id } },
  });
  if (error) return { error: error.code === "23505" ? "That URL name is taken; try another." : error.message };

  const ids = MAJOR_ESPN_IDS[season];
  if (ids && poolId) {
    for (const m of majors) {
      await supabase.rpc("golf_admin_add_major", { p_pool_id: poolId, p_major: m.id, p_espn_id: ids[m.id], p_name: m.name });
    }
  }
  redirect(`/p/${slug}/golf/admin/tournaments`);
}

/**
 * /pools/new for accounts that can't start pools yet: ask to run one. One request per
 * account, updated in place; the site's creator reads them in Supabase and approves by
 * adding the email to pool_creators.
 */
export async function requestPoolAccess(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("/pools/new");
  const supabase = await createClient();
  const pools = String(form.get("pools") ?? "").trim().slice(0, 300);
  const groupSize = String(form.get("group_size") ?? "").trim().slice(0, 60);
  const message = String(form.get("message") ?? "").trim().slice(0, 1000);
  // Was there a request already? Decides the email's subject line below.
  const { data: existing } = await supabase.from("pool_creator_requests").select("user_id").eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("pool_creator_requests").upsert({
    user_id: user.id,
    email: user.email,
    pools,
    group_size: groupSize,
    message,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "The request didn't send. Try again in a moment." };
  // Straight to the inbox too, so nobody has to go looking in the table.
  await notifyCreator(
    `${existing ? "Updated pool request" : "New pool request"}: ${user.email}`,
    [
      `From: ${user.email}`,
      `Wants to run: ${pools || "(not said)"}`,
      `Players: ${groupSize || "(not said)"}`,
      message ? `Message: ${message}` : null,
      "",
      "Approve in the Supabase SQL editor:",
      `  insert into pool_creators (email) values ('${user.email.replace(/'/g, "''")}');`,
    ]
      .filter((x) => x !== null)
      .join("\n"),
  );
  revalidatePath("/pools/new");
  return { ok: "Request sent. You'll get an email as soon as your account can start pools." };
}
