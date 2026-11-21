"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * A fixed-size window that shows all of what's inside: content taller than the window is
 * scaled down until it fits (laid out wider by the same factor, so it keeps its proportions),
 * never cut off. Every landing preview is the same size this way, so the page doesn't jump
 * when the slides change.
 */
export function FitBox({ children, className = "" }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const h = o.clientHeight;
      if (!h) return;
      // The content's unscaled height at its current layout width (the window's width ÷ scale).
      // Scaled by h ÷ that, it fits; laid out wider it gets a little shorter, so this settles
      // in a step or two.
      setScale((s) => {
        const natural = i.scrollHeight;
        if (!natural) return s;
        const next = Math.min(1, h / natural);
        return Math.abs(next - s) < 0.005 ? s : next;
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className={`relative overflow-hidden ${className}`}>
      <div
        ref={inner}
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: `${100 / scale}%`, transform: scale < 1 ? `scale(${scale})` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
