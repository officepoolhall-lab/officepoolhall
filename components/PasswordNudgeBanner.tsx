"use client";

import Link from "next/link";
import { useState } from "react";
import { PASSWORD_NUDGE_COOKIE } from "@/lib/passwordNudge";

export function PasswordNudgeBanner() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  function dismiss() {
    document.cookie = `${PASSWORD_NUDGE_COOKIE}=dismissed; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setHidden(true);
  }

  // Hidden on pages that fit the viewport (the grid), where it would push the scroll area off screen.
  return (
    <div className="mb-4 flex group-has-[[data-fill-viewport]]/main:hidden items-center gap-3 rounded-xl bg-surface px-4 py-2.5 text-sm">
      <p className="min-w-0 flex-1 text-muted">
        Skip the emailed code next time:{" "}
        <Link href="/account" className="font-medium text-accent hover:underline">set a password</Link>
      </p>
      <button type="button" onClick={dismiss} className="-mr-2 h-11 shrink-0 px-2 text-muted hover:text-ink">
        Not now
      </button>
    </div>
  );
}
