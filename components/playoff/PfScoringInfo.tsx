"use client";

import { useEffect, useRef, useState } from "react";

// A small "i" beside a page title: hover (desktop) or tap (phones) for the pool's scoring rules.

export type PfScoringGroups = { group: string; rows: [string, string][] }[];

export function PfScoringInfo({ groups, roster }: { groups: PfScoringGroups; /** "1 QB, 1 RB, 3 WR…" */ roster: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  // Fixed under the button and kept on screen (a title near the left edge, a narrow phone).
  const show = () => {
    const r = box.current?.getBoundingClientRect();
    if (r) {
      const w = Math.min(window.innerWidth >= 640 ? 608 : 352, window.innerWidth - 32);
      setAt({ top: r.bottom + 8, left: Math.max(16, Math.min(r.left, window.innerWidth - w - 16)) });
    }
    setOpen(true);
  };
  // A tap pins it open; a tap outside or Escape closes it.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) (setOpen(false), setPinned(false));
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), setPinned(false));
    // It's fixed under the button: scrolling the page closes it rather than leaving it behind.
    const scroll = (e: Event) => !box.current?.contains(e.target as Node) && (setOpen(false), setPinned(false));
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  return (
    <span
      ref={box}
      className="relative inline-flex align-middle"
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && !pinned && setOpen(false)}
    >
      <button
        type="button"
        onClick={() => (pinned ? (setPinned(false), setOpen(false)) : (setPinned(true), show()))}
        aria-expanded={open}
        aria-label="Scoring rules"
        className="grid size-6 cursor-pointer place-items-center rounded-full text-muted transition hover:bg-hover hover:text-ink"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-[18px]" aria-hidden>
          <circle cx="10" cy="10" r="8" />
          <path d="M10 9v5" strokeLinecap="round" />
          <circle cx="10" cy="6.3" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && at && (
        <span
          role="dialog"
          style={{ top: at.top, left: at.left }}
          aria-label="Scoring rules"
          className="fixed z-40 block w-[min(22rem,calc(100vw-2rem))] sm:w-[min(38rem,calc(100vw-2rem))] rounded-xl border-2 border-accent bg-bg p-4 text-left text-sm font-normal tracking-normal text-ink shadow-xl before:absolute before:inset-x-0 before:-top-3 before:h-3 before:content-['']"
        >
          <span className="block text-base font-bold">Scoring</span>
          <span className="mt-0.5 block text-xs text-muted">Lineup: {roster}. Every player scores every round through the Super Bowl.</span>
          <span className="mt-2 block max-h-[65vh] overflow-y-auto overscroll-contain sm:max-h-none sm:columns-2 sm:gap-6">
            {groups.map((g) => (
              <span key={g.group} className="mb-2 block break-inside-avoid">
                <span className="block border-b border-line pb-0.5 text-[11px] font-bold tracking-wide text-muted uppercase">{g.group}</span>
                {g.rows.map(([what, pts]) => (
                  <span key={what} className="flex justify-between gap-3 py-px text-[13px]">
                    <span>{what}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{pts}</span>
                  </span>
                ))}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}
