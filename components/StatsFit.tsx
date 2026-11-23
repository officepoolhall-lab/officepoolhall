"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * All-or-nothing secondary text: every [data-stat] line inside shows only if every one of them
 * fits on its line at a readable size (its own size, stepped down to `min` px). If any doesn't,
 * they all hide, so rows never mix with and without. Re-checks when the box's width changes.
 */
export function StatsFit({ children, className = "", min = 10 }: { children: ReactNode; className?: string; min?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => {
      const lines = [...box.querySelectorAll<HTMLElement>("[data-stat]")];
      for (const el of lines) {
        el.style.visibility = "";
        el.style.fontSize = "";
      }
      const ok = lines.every((el) => {
        const fits = () => el.scrollWidth <= el.clientWidth + 0.5;
        if (fits()) return true;
        const base = parseFloat(getComputedStyle(el).fontSize);
        for (let size = base - 0.5; size >= min; size -= 0.5) {
          el.style.fontSize = `${size}px`;
          if (fits()) return true;
        }
        return false;
      });
      if (!ok) for (const el of lines) el.style.visibility = "hidden";
    };
    fit();
    let w = box.clientWidth;
    const ro = new ResizeObserver(() => {
      if (box.clientWidth === w) return;
      w = box.clientWidth;
      fit();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [children, min]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
