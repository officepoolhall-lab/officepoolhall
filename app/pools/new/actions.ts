"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { parsePoolSettings, settingsError } from "@/lib/poolSettings";
import { createClient } from "@/lib/supabase/server";

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
  if (sport !== "ncaab" && sport !== "ncaaf") return { error: "Pick a sport." };
  if (!Number.isInteger(season) || season < 2020) return { error: "Enter the season's starting year." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("settings")));
  } catch {
    return { error: "Settings are missing." };
  }
  const parsed = parsePoolSettings(raw);
  if (!parsed.success) return { error: settingsError(raw) ?? "Invalid settings." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_pool", {
    p_name: name,
    p_slug: slug,
    p_sport: sport,
    p_season: season,
    p_entry_fee: entryFee,
    p_settings: parsed.data,
  });
  if (error) {
    return { error: error.code === "23505" ? "That URL name is taken; try another." : error.message };
  }
  redirect(`/p/${slug}/admin/roster`);
}

/**
 * A golf majors pool: all four majors, or one of them. The chosen majors are added with ESPN's
 * tournament ids for the season (when known); the rest of the setup is in the pool's Admin.
 */
async function createMajorsPool({ name, slug, season, entryFee, form }: { name: string; slug: string; season: number; entryFee: number; form: FormData }): Promise<ActionState> {
  const { MAJORS, MAJOR_ESPN_IDS } = await import("@/lib/golfMajors");
  if (!Number.isInteger(season) || season < 2026) return { error: "Enter the year of the majors (2027 for next season)." };
  const scope = String(form.get("majors_scope") ?? "all");
  const majors = scope === "all" ? MAJORS : MAJORS.filter((m) => m.id === scope);
  if (!majors.length) return { error: "Choose All Majors or one major." };
  const contest = form.get("majors_contest") === "salary" ? "salary" : "tiers";

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
