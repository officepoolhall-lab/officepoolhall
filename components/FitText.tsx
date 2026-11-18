"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * One line of text that shrinks its font (down to `min` px) until it fits its box, instead of
 * wrapping or being cut off. Starts from the size its classes give it, so short text keeps the
 * normal size. Re-fits when the box changes width (rotation, window resize).
 */
export function FitText({ children, className = "", min = 10 }: { children: ReactNode; className?: string; min?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 0.5 && size > min) {
        size = Math.max(min, size - 0.5);
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    // Its own width too: a sibling that grows or shrinks (a ticking countdown) changes the room left.
    if (el.parentElement) ro.observe(el);
    return () => ro.disconnect();
  }, [children, min]);
  return (
    <span ref={ref} className={`block min-w-0 overflow-hidden whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}
