"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronIcon } from "./ui";

type Pool = { name: string; slug: string };

/**
 * The pool name in the header. With more than one pool it opens a menu to jump to another
 * pool's home; with one it's plain text.
 */
export function PoolSwitcher({ current, pools }: { current: Pool; pools: Pool[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close after navigating, on a click outside, or on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (pools.length < 2) return <span className="max-w-48 truncate">{current.name}</span>;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-11 max-w-56 items-center gap-1 hover:text-ink"
      >
        <span className="truncate">{current.name}</span>
        <ChevronIcon className={`size-3.5 shrink-0 transition ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-64 rounded-2xl border border-line bg-bg p-1 shadow-lg">
          {pools.map((p) => {
            const active = p.slug === current.slug;
            return (
              <Link
                key={p.slug}
                role="menuitem"
                href={`/p/${p.slug}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm hover:bg-hover ${active ? "font-semibold text-ink" : "text-ink"}`}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {active && <CheckIcon className="size-4 shrink-0 text-accent" />}
              </Link>
            );
          })}
          <div className="my-1 border-t border-line" />
          <Link role="menuitem" href="/pools" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-xl px-3 text-sm text-muted hover:bg-hover hover:text-ink">
            All pools
          </Link>
        </div>
      )}
    </div>
  );
}
