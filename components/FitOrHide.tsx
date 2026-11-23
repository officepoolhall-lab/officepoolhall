"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * One line of secondary text that shows only when it fits, legibly: at its own size, or
 * stepped down to `min` px. If it still doesn't fit, it hides (the space stays, so whatever
 * sits after it keeps its place). Re-checks when its room changes.
 */
export function FitOrHide({ children, className = "", min = 10 }: { children: ReactNode; className?: string; min?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.visibility = "";
      el.style.fontSize = "";
      const fits = () => el.scrollWidth <= el.clientWidth + 0.5;
      if (fits()) return;
      const base = parseFloat(getComputedStyle(el).fontSize);
      for (let size = base - 0.5; size >= min; size -= 0.5) {
        el.style.fontSize = `${size}px`;
        if (fits()) return;
      }
      el.style.visibility = "hidden";
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [children, min]);
  return (
    <span ref={ref} className={`block overflow-hidden whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}
