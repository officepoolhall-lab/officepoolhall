"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { chipClass } from "./ui";

/** Tabs under the header: a sticky underlined row on phones, pills on wider screens. */
export function PoolNav({ slug, isCommissioner, week }: { slug: string; isCommissioner: boolean; week?: number }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  const tabs = [
    { href: base, label: "Home", match: (p: string) => p === base },
    { href: `${base}/picks`, label: "Picks", match: (p: string) => p.startsWith(`${base}/picks`) },
    { href: `${base}/standings`, label: "Standings", match: (p: string) => p.startsWith(`${base}/standings`) },
    { href: `${base}/grid/${week ?? 1}`, label: "Grid", match: (p: string) => p.startsWith(`${base}/grid`) },
    ...(isCommissioner ? [{ href: `${base}/admin/roster`, label: "Admin", match: (p: string) => p.startsWith(`${base}/admin`) }] : []),
  ];

  return (
    <nav className="sticky top-[calc(3rem+1px+env(safe-area-inset-top))] z-20 border-b border-line bg-bg/90 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-none">
      {/* Wider screens: the pills start at the page's left edge rather than a centered column. */}
      <ul className="flex pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:gap-1.5 sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pt-3">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.label} className="flex-1 sm:flex-none">
              {/* Phone: plain tab with an accent underline on the active one. */}
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-11 items-center justify-center text-sm font-medium sm:hidden ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
                {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" aria-hidden />}
              </Link>
              {/* Wider screens: pill. The wrapper does the hiding — chipClass sets its own
                  display (inline-flex), which would override a "hidden" on the link itself. */}
              <span className="hidden sm:block">
                <Link href={t.href} aria-current={active ? "page" : undefined} className={chipClass(active)}>
                  {t.label}
                </Link>
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
