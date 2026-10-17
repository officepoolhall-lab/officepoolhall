import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/** The signed-in user's id and email, or null. */
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? "" };
}

export async function requireUser(next = "/pools") {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
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
