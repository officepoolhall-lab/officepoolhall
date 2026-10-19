// "Keep me signed in" (login page). Supabase's sign-in cookies normally last about 400 days;
// when a player unticks the box, the app writes them without an expiry instead, so the browser
// drops them (and the player is signed out) when it closes. The choice itself lives in this
// cookie, so every later token refresh — server, proxy or browser — follows it.

export const REMEMBER_COOKIE = "oph_remember";
const YEAR = 400 * 24 * 60 * 60;

/** Options for the remember cookie itself: lasting when ticked, gone with the browser when not. */
export function rememberCookieOptions(remember: boolean) {
  return { path: "/", sameSite: "lax" as const, ...(remember ? { maxAge: YEAR } : {}) };
}

/** The player asked not to be remembered on this browser. */
export function forgetsSession(value: string | undefined) {
  return value === "0";
}

/** Turn a cookie's options into a browser-session cookie (no maxAge, no expires). */
export function sessionOnly<T extends { maxAge?: number; expires?: Date | number | string }>(options: T): T {
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
