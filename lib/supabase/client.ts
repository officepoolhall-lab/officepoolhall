import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../database.types";
import { forgetsSession, REMEMBER_COOKIE } from "../remember";

/** Supabase client for Client Components, acting as the signed-in user (RLS applies). */
export function createClient() {
  // Follow "Keep me signed in": unticked means cookies the browser writes expire with it too.
  const value = typeof document === "undefined" ? undefined : document.cookie.match(new RegExp(`(?:^|; )${REMEMBER_COOKIE}=([^;]*)`))?.[1];
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    forgetsSession(value) ? { cookieOptions: { maxAge: undefined } } : undefined,
  );
}
