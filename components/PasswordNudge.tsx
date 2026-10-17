import { cookies } from "next/headers";
import { PASSWORD_NUDGE_COOKIE } from "@/lib/passwordNudge";
import { createClient } from "@/lib/supabase/server";
import { PasswordNudgeBanner } from "./PasswordNudgeBanner";

/**
 * Suggests a password to players who sign in by emailed code. Render it inside <Suspense>:
 * the has_password check then streams in after the page instead of holding it up.
 */
export async function PasswordNudge() {
  if ((await cookies()).has(PASSWORD_NUDGE_COOKIE)) return null;
  const supabase = await createClient();
  const { data: hasPassword, error } = await supabase.rpc("has_password");
  if (error || hasPassword) return null;
  return <PasswordNudgeBanner />;
}
