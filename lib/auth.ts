import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/** The signed-in user's id and email, or null. */
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? "" };
}

/** The signed-in user's own profile (name fields). Cached per request. */
export const getProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, first_name, last_name, name_confirmed")
    .eq("id", userId)
    .maybeSingle();
  return data;
});

/** Sends signed-out visitors to /login, and players who haven't given their name yet to /welcome. */
export async function requireUser(next = "/pools") {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const profile = await getProfile(user.id);
  // A missing row (or a failed read) doesn't block the app; only a known-unnamed profile does.
  if (profile && !profile.name_confirmed) redirect(`/welcome?next=${encodeURIComponent(next)}`);
  return user;
}

/** Only allow redirects back into this app (no open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/pools") {
  if (!next) return fallback;
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const url = new URL(next, appUrl);
    if (url.origin !== new URL(appUrl).origin) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

/**
 * Where a successful email sign-in lands: /auth/done, which hands off to the tab that asked
 * for the link if it's still open. Unwraps our own /auth/callback?next=… so the final
 * destination is the page the player was going to.
 */
export function doneUrl(next: string, base: string) {
  let dest = next;
  const parsed = new URL(next, base);
  if (parsed.pathname === "/auth/callback") dest = safeNext(parsed.searchParams.get("next"));
  const url = new URL("/auth/done", base);
  url.searchParams.set("next", dest);
  return url;
}
