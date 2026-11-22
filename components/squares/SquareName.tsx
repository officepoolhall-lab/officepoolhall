"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A name inside a square, always shown in full: it wraps onto as many lines as it needs and the
 * font shrinks (down to `min` px) until the whole name fits the square, instead of being cut off.
 * Words only break where they have a space or hyphen. Re-fits when the square changes size.
 */
export function SquareName({ name, className = "", min = 6 }: { name: string; className?: string; min?: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const b = box.current;
    const t = text.current;
    if (!b || !t) return;
    const fit = () => {
      t.style.fontSize = "";
      const max = parseFloat(getComputedStyle(t).fontSize);
      const fits = () => t.scrollHeight <= b.clientHeight + 0.5 && t.scrollWidth <= b.clientWidth + 0.5;
      if (fits()) return;
      // The largest size that fits, to the half pixel.
      let lo = min;
      let hi = max;
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        t.style.fontSize = `${mid}px`;
        if (fits()) lo = mid;
        else hi = mid;
      }
      t.style.fontSize = `${Math.floor(lo * 2) / 2}px`;
    };
    fit();
    let w = b.clientWidth;
    const ro = new ResizeObserver(() => {
      if (b.clientWidth === w) return;
      w = b.clientWidth;
      fit();
    });
    ro.observe(b);
    return () => ro.disconnect();
  }, [name, min]);
  return (
    <span ref={box} className={`absolute inset-[2px] flex items-center justify-center overflow-hidden ${className}`}>
      <span ref={text} className="block max-w-full text-center leading-[1.1] [overflow-wrap:normal] [word-break:normal]">
        {name}
      </span>
    </span>
  );
}
