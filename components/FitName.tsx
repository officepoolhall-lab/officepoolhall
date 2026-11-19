"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** "Adrien Dumont De Chassart" → "A. Dumont De Chassart". */
export function initialName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/**
 * A person's name on one line, never wrapped or cut off: the font steps down (to `min` px) until it
 * fits its box; if the full name still doesn't fit at that size, it switches to the first initial
 * and last name ("B. James") and fits that. Re-fits when the box changes width (and tries the
 * full name again).
 */
export function FitName({ name, className = "", min = 11 }: { name: string; className?: string; min?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState(false);
  const shortName = initialName(name);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      // The short form may go a little smaller still (9px), for very narrow boxes.
      const floor = short ? Math.min(min, 9) : min;
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 0.5 && size > floor) {
        size = Math.max(floor, size - 0.5);
        el.style.fontSize = `${size}px`;
      }
      // Still too long at the smallest size: the initial and last name instead.
      if (!short && shortName !== name && el.scrollWidth > el.clientWidth + 0.5) setShort(true);
    };
    fit();
    // A new width: start again from the full name (it may fit now). The observer also reports the
    // current size when it starts, so only a real change counts.
    const box = el.parentElement ?? el;
    let width = box.clientWidth;
    const ro = new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      width = box.clientWidth;
      if (short) setShort(false);
      else fit();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [name, shortName, min, short]);
  return (
    <span ref={ref} title={short ? name : undefined} className={`block min-w-0 overflow-hidden whitespace-nowrap ${className}`}>
      {short ? shortName : name}
    </span>
  );
}
