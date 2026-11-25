"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { chipClass } from "./ui";

type Tab = { href: string; label: string; short?: string; phone: "main" | "more"; match: (p: string) => boolean };

/**
 * Tabs under the header. Phones: a sticky row of the four main tabs plus "More" (Scoreboard,
 * Message Board, Commissioner) so each tab gets room and readable text. Wider screens: every tab as a pill.
 */
export function PoolNav({ slug, sport, isCommissioner, week, majors = false, format = null }: { slug: string; sport: string; isCommissioner: boolean; week?: number; majors?: boolean; /** settings.format: pools with their own pages (lib/formats.ts). */ format?: string | null }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  // Golf pools have their own pages under /golf; the message board is shared.
  const g = sport === "pga" ? `${base}/golf` : base;
  const tabs: Tab[] = sport === "pga"
    ? [
        { href: g, label: "Home", phone: "main", match: (p) => p === g },
        { href: `${g}/picks`, label: "My Picks", short: "Picks", phone: "main", match: (p) => p.startsWith(`${g}/picks`) },
        { href: `${g}/standings`, label: "Standings", phone: "main", match: (p) => p.startsWith(`${g}/standings`) },
        { href: `${g}/leaderboard`, label: "Leaderboard", phone: "main", match: (p) => p.startsWith(`${g}/leaderboard`) || p.startsWith(`${g}/scoreboard`) },
        // Majors pools show each entry's golfers on Standings instead of a grid.
        ...(majors ? [] : [{ href: `${g}/grid`, label: "League Grid", short: "Grid", phone: "more" as const, match: (p: string) => p.startsWith(`${g}/grid`) }]),
        { href: `${base}/board`, label: "Message Board", phone: "more", match: (p) => p.startsWith(`${base}/board`) },
        ...(isCommissioner ? [{ href: `${g}/admin`, label: "Commissioner", phone: "more" as const, match: (p: string) => p.startsWith(`${g}/admin`) }] : []),
      ]
    : [
        // A Squares pool is its board: no picks or standings pages.
        { href: base, label: format === "squares" ? "Board" : "Home", phone: "main", match: (p) => p === base },
        ...(format === "squares" ? [] : [
          { href: `${base}/picks`, label: format === "survivor" ? "My Pick" : format === "playoff_fantasy" ? "My Team" : "My Picks", short: format === "survivor" ? "Pick" : format === "playoff_fantasy" ? "Team" : "Picks", phone: "main" as const, match: (p: string) => p.startsWith(`${base}/picks`) },
          // Survivor's standings are its grid of everyone's weekly picks: named like the other pools' grid.
          format === "survivor"
            ? { href: `${base}/standings`, label: "League Grid", short: "Grid", phone: "main" as const, match: (p: string) => p.startsWith(`${base}/standings`) }
            : { href: `${base}/standings`, label: "Standings", phone: "main" as const, match: (p: string) => p.startsWith(`${base}/standings`) },
        ]),
        // Pick X: the tournament bracket, live.
        ...(format === "pick_x" ? [
          { href: `${base}/bracket`, label: "Bracket", phone: "main" as const, match: (p: string) => p.startsWith(`${base}/bracket`) },
        ] : []),
        // Playoff Fantasy: ownership and the pool's numbers on a page of their own.
        ...(format === "playoff_fantasy" ? [
          { href: `${base}/summary`, label: "Pool Summary", short: "Summary", phone: "main" as const, match: (p: string) => p.startsWith(`${base}/summary`) },
        ] : []),
        // Weekly pools: the Grid and the Scoreboard. Pools with their own format show everyone's
        // picks on Standings instead; Survivor keeps the Scoreboard (it runs on weekly games).
        ...(format ? [] : [
          { href: `${base}/grid/${week ?? 1}`, label: "League Grid", short: "Grid", phone: "main" as const, match: (p: string) => p.startsWith(`${base}/grid`) },
        ]),
        // Pick X: every game, like the other college pools (under More on phones, beside its Bracket).
        ...(!format || format === "survivor" || format === "pick_x" ? [
          { href: `${base}/scoreboard`, label: "Scoreboard", phone: (format === "survivor" ? "main" : "more") as "main" | "more", match: (p: string) => p.startsWith(`${base}/scoreboard`) },
        ] : []),
        { href: `${base}/board`, label: "Message Board", phone: "more", match: (p) => p.startsWith(`${base}/board`) },
        ...(isCommissioner ? [{ href: `${base}/admin/roster`, label: "Commissioner", phone: "more" as const, match: (p: string) => p.startsWith(`${base}/admin`) }] : []),
      ];
  const main = tabs.filter((t) => t.phone === "main");
  const more = tabs.filter((t) => t.phone === "more");
  const activeMore = more.find((t) => t.match(pathname));

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLLIElement>(null);
  // Close the menu on picking an item, an outside tap (including another tab), or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const underline = <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" aria-hidden />;

  return (
    <nav className="sticky top-[calc(3rem+3px+env(safe-area-inset-top))] z-20 border-b border-line bg-bg sm:static sm:border-0 sm:bg-transparent">
      {/* Phones: the main tabs and More, each as wide as its label, with equal space between
          them (justify-evenly). The text is a touch smaller so "Leaderboard" fits. */}
      <ul className="flex justify-evenly pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:hidden">
        {main.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.label} className="min-w-0">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-11 items-center justify-center whitespace-nowrap px-2 text-[13px] tracking-tight ${active ? "font-semibold text-accent" : "font-medium text-muted hover:text-ink"}`}
              >
                {t.short ?? t.label}
                {active && underline}
              </Link>
            </li>
          );
        })}
        {more.length > 0 && (
          <li ref={menuRef} className="relative min-w-0">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-haspopup="menu"
              className={`relative flex h-11 w-full items-center justify-center gap-0.5 whitespace-nowrap px-2 text-[13px] tracking-tight ${activeMore ? "font-semibold text-accent" : open ? "font-medium text-ink" : "font-medium text-muted hover:text-ink"}`}
            >
              More
              <svg viewBox="0 0 12 12" className={`size-3 transition ${open ? "rotate-180" : ""}`} aria-hidden>
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {activeMore && underline}
            </button>
            {open && (
              <ul role="menu" className="absolute right-2 top-full z-30 mt-1 min-w-48 overflow-hidden rounded-xl border-2 border-accent bg-surface py-1 shadow-lg">
                {more.map((t) => {
                  const active = t.match(pathname);
                  return (
                    <li key={t.label} role="none">
                      <Link
                        role="menuitem"
                        href={t.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={`flex h-11 items-center px-4 text-[15px] ${active ? "font-semibold text-accent" : "text-ink hover:bg-hover"}`}
                      >
                        {t.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        )}
      </ul>

      {/* Wider screens: every tab as a pill, from the page's left edge. */}
      <ul className="hidden gap-1.5 pl-[max(1rem,env(safe-area-inset-left))] pt-3 sm:flex">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.label}>
              {/* The current tab in the logo's blue. */}
              <Link href={t.href} aria-current={active ? "page" : undefined} className={chipClass(active, active ? "!bg-accent !text-white dark:!text-black" : "")}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
