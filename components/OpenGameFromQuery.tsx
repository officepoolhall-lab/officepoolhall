"use client";

import { usePathname, useRouter } from "next/navigation";
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
    // Remember this page (?back=), so refreshing again comes back here too.
    router.push(`/p/${slug}/game/${id}?back=${encodeURIComponent(url.pathname + url.search)}`, { scroll: false });
  }, [router, slug]);
  return null;
}

/**
 * Remembers the last page of this pool that isn't a game, so a game address that arrives with no
 * ?back= (a shared link, an old bookmark) can return there rather than to My Picks.
 */
export function RememberPoolPage({ slug }: { slug: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.includes("/game/")) return;
    try {
      sessionStorage.setItem(`pool-page:${slug}`, window.location.pathname + window.location.search);
    } catch {
      // Private mode: the fallback is My Picks.
    }
  }, [pathname, slug]);
  return null;
}

/** A game address with no ?back=: back to the last page seen in this pool, with the game open. */
export function ReturnToPoolPage({ slug, gameId }: { slug: string; gameId: string }) {
  const router = useRouter();
  useEffect(() => {
    let page = `/p/${slug}/picks`;
    try {
      const saved = sessionStorage.getItem(`pool-page:${slug}`);
      if (saved && saved.startsWith(`/p/${slug}/`) && !saved.includes("/game/")) page = saved;
    } catch {
      // Private mode: My Picks.
    }
    router.replace(`${page}${page.includes("?") ? "&" : "?"}game=${encodeURIComponent(gameId)}`);
  }, [router, slug, gameId]);
  return <p className="py-10 text-center text-sm text-muted">Opening the game…</p>;
}
