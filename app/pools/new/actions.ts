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
