import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { doneUrl, safeNext } from "@/lib/auth";

// Magic-link target. Uses token_hash (not PKCE) so the link works even when the
// email opens in a different browser than the one that requested it.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = (params.get("type") ?? "email") as EmailOtpType;
  const next = safeNext(params.get("next"));

  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(doneUrl(next, request.url));
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("error", "That sign-in link is invalid or expired. Request a new one.");
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
