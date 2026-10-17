import { createClient } from "npm:@supabase/supabase-js@2";

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * These jobs spend API quota, so only the service role may run them (pg_cron and
 * the app's server actions). The gateway has already verified the JWT signature;
 * here we just check its role.
 */
export function requireServiceRole(req: Request): Response | null {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.role === "service_role") return null;
  } catch {
    // fall through
  }
  return json({ error: "service role required" }, 403);
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function readBody<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) ?? {};
  } catch {
    return {};
  }
}

/** Wrap a handler so thrown errors (ESPN/Odds API down, etc.) come back as JSON. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  };
}
