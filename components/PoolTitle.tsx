"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/**
 * The pool's name above the tabs, on the pool's Home page only (the other tabs keep their
 * own titles and their measured, viewport-filling layouts). Always one line: it starts at
 * 30px on phones and 36px from the sm breakpoint, and shrinks to fit a long name.
 */
export function PoolTitle({ slug, name }: { slug: string; name: string }) {
  const show = usePathname() === `/p/${slug}`;
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const max = window.matchMedia("(min-width: 640px)").matches ? 36 : 30;
      el.style.fontSize = `${max}px`;
      const avail = el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight);
      const need = el.scrollWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight);
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
    <h1
      ref={ref}
      // Before the measurement runs: an estimate from the name's length so it already fits.
      style={{ fontSize: `min(var(--title-max), calc((100vw - 2rem) / ${Math.max(1, name.length * 0.6).toFixed(1)}))` }}
      className="overflow-hidden whitespace-nowrap pb-1 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 font-extrabold leading-tight tracking-[-0.03em] [--title-max:30px] sm:[--title-max:36px]"
    >
      {name}
    </h1>
  );
}
