"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * One line of text that shrinks its font (down to `min` px) until it fits its box, instead of
 * wrapping or being cut off. Starts from the size its classes give it, so short text keeps the
 * normal size. Re-fits when the box changes width (rotation, window resize).
 *
 * Kept cheap because a page can have hundreds (every name on Standings): text that already fits
 * is only read, never written, so all of them share one layout; text that doesn't fit is sized in
 * one step from the ratio (plus at most one correction), not shrunk half a pixel at a time.
 */
export function FitText({ children, className = "", min = 10 }: { children: ReactNode; className?: string; min?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fits = () => el.scrollWidth <= el.clientWidth + 0.5;
    const fit = () => {
      // Already fits at its own size: nothing to change (a read only).
      if (!el.style.fontSize && fits()) return;
      el.style.fontSize = "";
      if (fits()) return;
      const max = parseFloat(getComputedStyle(el).fontSize);
      let size = Math.max(min, Math.floor(max * (el.clientWidth / el.scrollWidth) * 2) / 2);
      el.style.fontSize = `${size}px`;
      if (!fits() && size > min) {
        size = Math.max(min, size - 0.5);
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    // Again only when a width actually changes: the box (window resize, rotation) or this text's
    // own room (a sibling that grows, like a ticking countdown). The observer also reports the
    // sizes it starts with; those are skipped.
    const box = el.parentElement;
    let boxW = box?.clientWidth ?? 0;
    let ownW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const b = box?.clientWidth ?? 0;
      const o = el.clientWidth;
      if (b === boxW && o === ownW) return;
      boxW = b;
      ownW = o;
      fit();
    });
    if (box) ro.observe(box);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, min]);
  return (
    <span ref={ref} className={`block min-w-0 overflow-hidden whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}
