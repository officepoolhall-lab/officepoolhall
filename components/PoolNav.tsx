"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { chipClass } from "./ui";

type Tab = { href: string; label: string; short?: string; phone: "main" | "more"; match: (p: string) => boolean };

/**
 * Tabs under the header. Phones: a sticky row of the four main tabs plus "More" (Scoreboard,
 * Message Board, Admin) so each tab gets room and readable text. Wider screens: every tab as a pill.
 */
export function PoolNav({ slug, isCommissioner, isGuest = false, week }: { slug: string; isCommissioner: boolean; isGuest?: boolean; week?: number }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  // Guests have no picks of their own, so no My Picks; Scoreboard takes its place on phones.
  const tabs: Tab[] = [
    { href: base, label: "Home", phone: "main", match: (p) => p === base },
    ...(isGuest ? [] : [{ href: `${base}/picks`, label: "My Picks", short: "Picks", phone: "main" as const, match: (p: string) => p.startsWith(`${base}/picks`) }]),
    { href: `${base}/standings`, label: "Standings", phone: "main", match: (p) => p.startsWith(`${base}/standings`) },
    { href: `${base}/grid/${week ?? 1}`, label: "League Grid", short: "Grid", phone: "main", match: (p) => p.startsWith(`${base}/grid`) },
    { href: `${base}/scoreboard`, label: "Scoreboard", short: "Scores", phone: isGuest ? "main" : "more", match: (p) => p.startsWith(`${base}/scoreboard`) },
    { href: `${base}/board`, label: "Message Board", phone: "more", match: (p) => p.startsWith(`${base}/board`) },
    ...(isCommissioner ? [{ href: `${base}/admin/roster`, label: "Admin", phone: "more" as const, match: (p: string) => p.startsWith(`${base}/admin`) }] : []),
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

  const underline = <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" aria-hidden />;

  return (
    <nav className="sticky top-[calc(3rem+1px+env(safe-area-inset-top))] z-20 border-b border-line bg-bg/90 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-none">
      {/* Phones: four main tabs and More, sharing the width. */}
      <ul className="flex pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:hidden">
        {main.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.label} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-11 items-center justify-center px-1 text-sm font-medium ${active ? "text-ink" : "text-muted hover:text-ink"}`}
              >
                {t.short ?? t.label}
                {active && underline}
              </Link>
            </li>
          );
        })}
        {more.length > 0 && (
          <li ref={menuRef} className="relative flex-1">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-haspopup="menu"
              className={`relative flex h-11 w-full items-center justify-center gap-1 px-1 text-sm font-medium ${activeMore || open ? "text-ink" : "text-muted hover:text-ink"}`}
            >
              More
              <svg viewBox="0 0 12 12" className={`size-3 transition ${open ? "rotate-180" : ""}`} aria-hidden>
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {activeMore && underline}
            </button>
            {open && (
              <ul role="menu" className="absolute right-2 top-full z-30 mt-1 min-w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
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
              <Link href={t.href} aria-current={active ? "page" : undefined} className={chipClass(active)}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
