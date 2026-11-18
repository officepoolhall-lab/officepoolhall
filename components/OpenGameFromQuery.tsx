"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Reopens a game's pop-up after a refresh: a game's address loaded on its own redirects to the
 * page it was opened from with ?game=<id>; this takes that off the address and opens the game
 * the usual way, so it shows as the pop-up over this page (and closing it lands here).
 */
export function OpenGameFromQuery({ slug }: { slug: string }) {
  const router = useRouter();
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("game");
    if (!id || !/^([0-9a-f-]{36}|\d{5,12})$/i.test(id)) return;
    url.searchParams.delete("game");
    window.history.replaceState(window.history.state, "", url);
    router.push(`/p/${slug}/game/${id}`, { scroll: false });
  }, [router, slug]);
  return null;
}
