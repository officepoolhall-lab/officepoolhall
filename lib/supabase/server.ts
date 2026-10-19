import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../database.types";
import { forgetsSession, REMEMBER_COOKIE, sessionOnly } from "../remember";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers, acting as the
 * signed-in user (RLS applies). `remember` overrides the "Keep me signed in" cookie (the
 * login actions pass the box's value); otherwise that cookie decides whether the sign-in
 * cookies outlive the browser.
 */
export async function createClient(opts: { remember?: boolean } = {}) {
  const cookieStore = await cookies();
  const forget = opts.remember === undefined ? forgetsSession(cookieStore.get(REMEMBER_COOKIE)?.value) : !opts.remember;
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, forget ? sessionOnly(options) : options));
          } catch {
            // Called from a Server Component, which can't set cookies. proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
