"use client";

import { useEffect, useRef, useState } from "react";

// A small "i" beside a page title: hover (desktop) or tap (phones) for the pool's scoring rules.
// Any pool type: the rules come in as groups of [what, points] with a line above them.

export type ScoringGroups = { group: string; rows: [string, string][] }[];

/** A points table: a label column on the left, the values across (Pick X: seed tiers by round, max on the right). */
export type ScoringTable = { head: string[]; rows: string[][] };

export function ScoringInfo({ groups, intro, table }: { groups: ScoringGroups; /** A line under the heading ("Lineup: 1 QB, …"). */ intro?: string; table?: ScoringTable }) {
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
          {intro && <span className="mt-0.5 block text-xs text-muted">{intro}</span>}
          {table && (
            <span className="mt-2 block overflow-x-auto">
              <table className="w-full text-[12px] tabular-nums sm:text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[10px] font-bold tracking-wide text-muted uppercase sm:text-[11px]">
                    {table.head.map((h, i) => (
                      <th key={h} className={`pb-1 font-bold ${i === 0 ? "text-left" : "text-right"} ${i === table.head.length - 1 ? "pl-2" : i > 0 ? "pl-1.5" : ""}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row[0]} className="border-b border-line last:border-0">
                      {row.map((v, i) => (
                        <td key={i} className={`py-1 ${i === 0 ? "pr-1 whitespace-nowrap text-left font-semibold" : "text-right"} ${i === row.length - 1 ? "pl-2 font-bold" : i > 0 ? "pl-1.5" : ""}`}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </span>
          )}
          <span className={`mt-2 block max-h-[65vh] overflow-y-auto overscroll-contain sm:max-h-none ${table ? "" : "sm:columns-2 sm:gap-6"}`}>
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
