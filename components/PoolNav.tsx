"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { chipClass } from "./ui";

/** Bottom tab bar on phones, pill tabs under the header on wider screens. */
export function PoolNav({ slug, isCommissioner, week }: { slug: string; isCommissioner: boolean; week?: number }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  const tabs = [
    { href: base, label: "Home", match: (p: string) => p === base },
    { href: `${base}/picks`, label: "Picks", match: (p: string) => p.startsWith(`${base}/picks`) },
    { href: `${base}/standings`, label: "Standings", match: (p: string) => p.startsWith(`${base}/standings`) },
    { href: `${base}/grid/${week ?? 1}`, label: "Grid", match: (p: string) => p.startsWith(`${base}/grid`) },
    ...(isCommissioner ? [{ href: `${base}/admin/slate`, label: "Admin", match: (p: string) => p.startsWith(`${base}/admin`) }] : []),
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:pb-0 sm:backdrop-blur-none">
      <ul className="mx-auto flex max-w-3xl pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] sm:gap-1.5 sm:px-4 sm:pt-3">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.label} className="flex-1 sm:flex-none">
              {/* Phone: plain tab with a small accent dot under the active one. */}
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center text-xs font-medium sm:hidden ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
                {active && <span className="absolute bottom-2 size-1 rounded-full bg-accent" aria-hidden />}
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
