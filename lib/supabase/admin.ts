import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

/**
 * Service-role client: bypasses RLS. Server-only — never import this from a
 * Client Component. Use it only for ingestion (schedule/lines/scores), after
 * checking the caller is the commissioner.
 */
export function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
