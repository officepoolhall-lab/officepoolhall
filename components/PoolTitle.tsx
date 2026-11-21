"use client";

import { usePathname } from "next/navigation";
import { SportIcon } from "./SportIcon";
import { useLayoutEffect, useRef } from "react";
import type { PoolKind } from "@/lib/poolType";

/**
 * The pool's name above the tabs, on the pool's Home page only (golf's Home included) (the other tabs keep their
 * own titles and their measured, viewport-filling layouts): a blue sport badge, then the name with
 * the kind of pool under it ("NFL Supercontest"). The name is always one line: it starts at
 * 30px on phones and 36px from the sm breakpoint, and shrinks to fit a long name.
 */
export function PoolTitle({ slug, name, kind, type }: { slug: string; name: string; kind: PoolKind; type: string }) {
  // Home is /p/[slug] for football and basketball, /p/[slug]/golf for golf pools.
  const pathname = usePathname();
  const show = pathname === `/p/${slug}` || pathname === `/p/${slug}/golf`;
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const max = window.matchMedia("(min-width: 640px)").matches ? 36 : 30;
      el.style.fontSize = `${max}px`;
      const avail = el.clientWidth;
      const need = el.scrollWidth;
      // A hair under, so rounding never tips it into an overflow.
      if (need > avail) el.style.fontSize = `${Math.max(14, Math.floor(max * (avail / need) * 10) / 10 - 0.2)}px`;
    };
    fit();
    // Again once the web font has loaded (its widths differ from the fallback's) and on resize.
    document.fonts?.ready.then(fit).catch(() => {});
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [name, show]);

  if (!show) return null;
  return (
    <div className="flex items-center gap-3 pb-1 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 sm:gap-3.5">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-accent text-white shadow-sm sm:size-14 sm:rounded-2xl">
        <SportIcon kind={kind} className="size-7 sm:size-8" />
      </span>
      <div className="min-w-0 flex-1">
        <h1
          ref={ref}
          // Before the measurement runs: an estimate from the name's length so it already fits
          // (the screen less its padding and the badge).
          style={{ fontSize: `min(var(--title-max), calc((100vw - 5.5rem) / ${Math.max(1, name.length * 0.6).toFixed(1)}))` }}
          className="overflow-hidden whitespace-nowrap font-extrabold leading-tight tracking-[-0.03em] [--title-max:30px] sm:[--title-max:36px]"
        >
          {name}
        </h1>
        <p className="truncate text-[13px] font-medium text-muted sm:text-sm">{type}</p>
      </div>
    </div>
  );
}
