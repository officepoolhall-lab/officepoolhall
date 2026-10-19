"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the page's server data every `seconds` while `active` (a game is live), so
 * scores move without a reload. Client state such as unsaved picks is kept. Skips while the
 * tab is hidden and catches up when it comes back.
 */
export function AutoRefresh({ active, seconds = 60 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, seconds, router]);
  return null;
}
