"use client";

import { useEffect, useRef } from "react";
import { Button, Cell } from "@/components/ui";

/**
 * Bottom sheet for assigning a confidence value to one game. Mounted only while open,
 * so it focuses itself on mount and hands focus back to the opener on unmount.
 */
export function PointsSheet({
  title,
  tiers,
  current,
  onChoose,
  onClear,
  onClose,
}: {
  title: string;
  tiers: { points: number; left: number }[];
  current: number | null;
  onChoose: (points: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheet.current?.focus();
    // The page behind stays put while the sheet is up.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // aria-modal alone doesn't stop Tab: wrap focus inside the sheet.
      if (e.key === "Tab" && sheet.current) {
        const items = [...sheet.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
        if (!items.length) return e.preventDefault();
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === sheet.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !sheet.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="points-sheet-title"
        tabIndex={-1}
        className="relative rounded-t-2xl border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] outline-none"
      >
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-faint" aria-hidden />
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="points-sheet-title" className="min-w-0 truncate text-[15px] font-semibold">
              {title}
            </h2>
            <Button kind="ghost" className="-mr-3 shrink-0" onClick={onClear} disabled={current === null}>
              Clear
            </Button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-2">
            {tiers.map((t) => {
              const selected = current === t.points;
              return (
                <Cell
                  key={t.points}
                  value={t.points}
                  sub={<span className="text-xs">{`${t.left} left`}</span>}
                  selected={selected}
                  disabled={!selected && t.left <= 0}
                  onClick={() => onChoose(t.points)}
                  label={`${t.points} points, ${t.left} left`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
