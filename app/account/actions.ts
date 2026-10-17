"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ActionForm";
import { getUser, safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const MAX_NAME = 50;
const clean = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Validates and saves first/last name (set_my_name keeps display_name as "First Last"). */
async function saveNameFrom(form: FormData): Promise<string | null> {
  if (!(await getUser())) return "You're signed out. Sign in again.";
  const first = clean(form.get("first_name"));
  const last = clean(form.get("last_name"));
  if (!first || !last) return "Enter your first and last name.";
  if (first.length > MAX_NAME || last.length > MAX_NAME) return `Names can be up to ${MAX_NAME} characters.`;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_name", { p_first_name: first, p_last_name: last });
  return error ? error.message : null;
}

/** /welcome: save the name, then carry on to where the player was going. */
export async function continueWithName(_: ActionState, form: FormData): Promise<ActionState> {
  const error = await saveNameFrom(form);
  if (error) return { error };
  redirect(safeNext(String(form.get("next") ?? "")));
}

/** /account: save the name and stay. */
export async function updateName(_: ActionState, form: FormData): Promise<ActionState> {
  const error = await saveNameFrom(form);
  if (error) return { error };
  revalidatePath("/", "layout");
  return { ok: "Name saved." };
}

/**
 * Optional password, so a player can sign in without waiting for an emailed code. Matches
 * [auth] minimum_password_length / password_requirements in supabase/config.toml.
 */
export async function setPassword(_: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getUser())) return { error: "You're signed out. Sign in again." };
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  // bcrypt only reads the first 72 bytes.
  if (new TextEncoder().encode(password).length > 72) return { error: "That's too long; keep it under 72 characters." };
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return { error: "Include at least one letter and one number." };
  if (password !== confirm) return { error: "The passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "That's already your password." };
    if (error.code === "weak_password") return { error: "That password is too weak. Try a longer one with letters and numbers." };
    return { error: error.message };
  }
  revalidatePath("/account");
  return { ok: "Password saved. You can sign in with it next time." };
}
