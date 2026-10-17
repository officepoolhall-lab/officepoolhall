import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { doneUrl, safeNext } from "@/lib/auth";

// Target for Supabase's default (PKCE) email links, which arrive with ?code=. Our own
// templates use /auth/confirm (token_hash) instead; this keeps sign-in working either way.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const url = new URL("/login", request.url);
      url.searchParams.set("error", "That sign-in link is invalid or expired. Request a new one.");
      url.searchParams.set("next", next);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.redirect(doneUrl(next, request.url));
}
