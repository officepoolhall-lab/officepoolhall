"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";

export type LoginState = { error?: string; sentTo?: string; next?: string } | null;

export async function sendLink(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(String(form.get("next") ?? ""));
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Default Supabase emails land on /auth/callback (?code=); our templates use /auth/confirm.
    options: { emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  });
  if (error) return { error: error.message };
  return { sentTo: email, next };
}

export async function verifyCode(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const token = String(form.get("code") ?? "").replace(/\s/g, "");
  const next = safeNext(String(form.get("next") ?? ""));

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { sentTo: email, next, error: "That code didn't work. Check it, or request a new link." };
  redirect(next);
}
