"use client";

import { usePathname } from "next/navigation";

/**
 * The pool's name above the tabs, on the pool's Home page only (the other tabs keep their
 * own titles and their measured, viewport-filling layouts).
 */
export function PoolTitle({ slug, name }: { slug: string; name: string }) {
  if (usePathname() !== `/p/${slug}`) return null;
  return (
    <h1 className="pb-1 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
      {name}
    </h1>
  );
}
