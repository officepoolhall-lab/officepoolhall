"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Highlights the column under the pointer on the Grid (the row is plain CSS: .pick-grid in
 * globals.css). Cells carry data-col; this writes one CSS rule for the hovered column instead
 * of re-rendering the table. Mouse and trackpad only: touch screens have no hover.
 */
export function GridHover({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const rule = useRef<HTMLStyleElement>(null);

  useEffect(() => {
    const el = box.current;
    const style = rule.current;
    if (!el || !style || !window.matchMedia("(hover: hover)").matches) return;
    let col: string | null = null;
    const set = (next: string | null) => {
      if (next === col) return;
      col = next;
      style.textContent = next
        ? `.pick-grid td[data-col="${next}"]{box-shadow:inset 0 0 0 999px var(--grid-hover)}` +
          `.pick-grid th[data-col="${next}"]{background-color:color-mix(in srgb,var(--accent) 8%,var(--bg))}`
        : "";
    };
    const over = (e: PointerEvent) => {
      const cell = (e.target as Element | null)?.closest?.("[data-col]");
      set(cell?.getAttribute("data-col") ?? null);
    };
    const leave = () => set(null);
    el.addEventListener("pointerover", over);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointerover", over);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div ref={box} className="contents">
      <style ref={rule} />
      {children}
    </div>
  );
}
