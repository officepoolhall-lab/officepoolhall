"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ActionForm";
import { getUser, safeNext } from "@/lib/auth";
import { PASSWORD_NUDGE_COOKIE } from "@/lib/passwordNudge";
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

/** /welcome: save the name (and the optional password), then carry on to where the player was going. */
export async function continueWithName(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  // Check the password before saving anything, so a typo doesn't leave the name saved and the page gone.
  if (password) {
    const invalid = checkPassword(password, String(form.get("confirm") ?? ""));
    if (invalid) return { error: invalid };
  }
  const error = await saveNameFrom(form);
  if (error) return { error };
  if (password) {
    const failed = await savePassword(password);
    if (failed) return { error: `Your name is saved, but the password wasn't: ${failed} You can set one later under Account.` };
  }
  redirect(safeNext(String(form.get("next") ?? "")));
}

/** /account: save the name and stay. */
export async function updateName(_: ActionState, form: FormData): Promise<ActionState> {
  const error = await saveNameFrom(form);
  if (error) return { error };
  revalidatePath("/", "layout");
  return { ok: "Name saved." };
}

/** Matches [auth] minimum_password_length / password_requirements in supabase/config.toml. */
function checkPassword(password: string, confirm: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  // bcrypt only reads the first 72 bytes.
  if (new TextEncoder().encode(password).length > 72) return "That's too long; keep it under 72 characters.";
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  if (password !== confirm) return "The passwords don't match.";
  return null;
}

/** Saves the password and retires the "set a password" banner on this device. */
async function savePassword(password: string): Promise<string | null> {
  const supabase = await createClient();
  // password_set feeds has_password(): a code sign-up already has a random hash, so that can't tell.
  const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } });
  if (error) {
    if (error.code === "same_password") return "That's already your password.";
    if (error.code === "weak_password") return "That password is too weak. Try a longer one with letters and numbers.";
    return error.message;
  }
  (await cookies()).set(PASSWORD_NUDGE_COOKIE, "done", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return null;
}

/** Optional password, so a player can sign in without waiting for an emailed code. */
export async function setPassword(_: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getUser())) return { error: "You're signed out. Sign in again." };
  const password = String(form.get("password") ?? "");
  const invalid = checkPassword(password, String(form.get("confirm") ?? ""));
  if (invalid) return { error: invalid };
  const failed = await savePassword(password);
  if (failed) return { error: failed };
  revalidatePath("/account");
  return { ok: "Password saved. You can sign in with it next time." };
}

// ---------- Email ----------

/**
 * Starts an email change. Supabase's secure email change (config.toml double_confirm_changes)
 * emails a link to both the current and the new address; the change applies once both are
 * clicked. The links come back to /account.
 */
export async function changeEmail(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await getUser();
  if (!user) return { error: "You're signed out. Sign in again." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (email === user.email?.toLowerCase()) return { error: "That's already your email." };

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${appUrl}/account?email=confirmed` });
  if (error) {
    if (/already (been )?registered|already exists/i.test(error.message)) {
      return { error: "Another account already uses that email." };
    }
    if (error.code === "over_email_send_rate_limit") return { error: "Too many emails just now. Try again in a few minutes." };
    return { error: error.message };
  }
  revalidatePath("/account");
  return { ok: `Check both inboxes: we sent a confirmation link to ${user.email} and to ${email}. Click both to finish the change.` };
}

// ---------- Co-managers ----------

export type InviteState = { token?: string; error?: string } | null;

/** A fresh co-manager invite link for the player's entry in a pool (replaces their unused one). */
export async function createComanagerInvite(poolId: string, _: InviteState): Promise<InviteState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_comanager_invite", { p_pool_id: poolId });
  return error ? { error: error.message } : { token: data };
}

/** The owner removes a co-manager, or a co-manager steps down (managerId = themselves). */
export async function removeComanager(poolId: string, managerId: string) {
  const supabase = await createClient();
  await supabase.rpc("remove_comanager", { p_pool_id: poolId, p_manager_id: managerId });
  revalidatePath("/account");
}

/** /comanage/[token]: accept, then go to the pool. */
export async function acceptComanagerInvite(token: string): Promise<{ error: string }> {
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("accept_comanager_invite", { p_token: token });
  if (error || !slug) return { error: error?.message ?? "Something went wrong." };
  return redirect(`/p/${slug}`);
}
