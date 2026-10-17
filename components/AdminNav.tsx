"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { chipClass } from "./ui";

/**
 * Commissioner sub-nav pills. A client component only so it can read the pathname
 * and highlight the current tab; the admin layout itself stays a server component.
 */
export function AdminNav({ base, tabs }: { base: string; tabs: [path: string, label: string][] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Commissioner">
      {tabs.map(([path, label]) => {
        const href = `${base}/${path}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={path} href={href} aria-current={active ? "page" : undefined} className={chipClass(active, "min-h-11")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
