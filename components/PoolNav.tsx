"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Bottom tab bar on phones, top tabs on wider screens. */
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:static sm:border-0 sm:bg-transparent sm:pb-0">
      <ul className="mx-auto flex max-w-3xl sm:gap-1 sm:px-4 sm:pt-3">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.label} className="flex-1 sm:flex-none">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 items-center justify-center font-display text-sm font-semibold uppercase tracking-wide sm:h-9 sm:rounded-full sm:px-4 ${
                  active ? "text-felt sm:bg-felt sm:text-white" : "text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
