"use client";

import { useEffect, useRef, useState } from "react";
import { AxisLockScroll } from "./AxisLockScroll";
import { LiveDot, LockIcon } from "./ui";

export type GridCell = {
  golfer: string | null;
  /** Another entry's pick for an event that hasn't locked yet. */
  hidden: boolean;
  /** "T7", "MC", "WD"; or the live line ("T12 · −4 · Thru 9") while under way. */
  finish: string;
  earned: number;
  final: boolean;
  won: boolean;
  /** The most money anyone earned that week. */
  topOfWeek: boolean;
};

export type GridRow = { userId: string; name: string; isMe: boolean; place: number; tied: boolean; total: number; cells: GridCell[] };
export type GridWeek = { week: number; short: string; name: string; final: boolean; live: boolean; open: boolean; popular: { golfer: string; count: number } | null };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const short$ = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`;
const lastName = (n: string) => n.split(" ").slice(-1)[0];

/** A small trophy, for a golfer who won the tournament. */
export function TrophyIcon({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M4 1h8v1.5h2.5V5a3 3 0 0 1-3 3h-.1A4 4 0 0 1 8.75 10.4V12H11v1.5H5V12h2.25v-1.6A4 4 0 0 1 4.6 8h-.1a3 3 0 0 1-3-3V2.5H4V1Zm0 3H3v1a1.5 1.5 0 0 0 1 1.4V4Zm8 0v2.4A1.5 1.5 0 0 0 13 5V4h-1ZM4 14.5h8V16H4v-1.5Z" />
    </svg>
  );
}

/**
 * The golf League Grid, styled like the football and basketball grids: entries down the left,
 * tournaments across the top, both pinned while the box scrolls (one axis per swipe on touch
 * screens). Opens on the latest weeks. Each cell is the golfer's last name and what the pick
 * earned; a trophy marks a tournament winner. Tap a cell for its details.
 */
export function GolfGrid({ rows, weeks }: { rows: GridRow[]; weeks: GridWeek[] }) {
  const inner = useRef<HTMLTableElement>(null);
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => {
    // The scroll box is the table's parent: open on the latest weeks (the right end).
    const el = inner.current?.parentElement;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <AxisLockScroll className="relative -mx-4 min-h-0 flex-1 overflow-auto isolate sm:mx-0">
      <table ref={inner} className="border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 border-b border-r border-line bg-bg px-4 py-1.5 text-left align-bottom text-xs font-medium text-muted">
              <div className="flex items-end justify-between gap-3">
                <span className="min-w-20">Entry</span>
                <span className="shrink-0 whitespace-nowrap text-right">Season</span>
              </div>
            </th>
            {weeks.map((w) => (
              <th
                key={w.week}
                title={w.name}
                className="sticky top-0 z-20 min-w-[4.75rem] max-w-24 border-b border-line bg-bg px-1 py-1.5 text-center align-bottom text-[11px] font-medium leading-tight text-muted"
              >
                <div className="mb-0.5 whitespace-nowrap text-[10px] font-normal">
                  {w.live ? <LiveDot>Live</LiveDot> : w.final ? <span className="font-semibold">Final</span> : <span>Wk {w.week}</span>}
                </div>
                <div className="mx-auto line-clamp-2 max-w-[5.5rem] text-ink">{w.short}</div>
                {!w.live && w.final && <div className="text-[10px] font-normal tabular-nums">Wk {w.week}</div>}
                {/* Others' picks in this column are hidden until the lock. */}
                {w.open && <LockIcon className="mx-auto mt-0.5 size-2.5 text-muted" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="[&:last-child>*]:border-b-0">
              {/* "You" is the accent name plus a 2px edge, not a row fill (as on the other grids). */}
              <th
                className={`sticky left-0 z-10 border-b border-r border-line bg-bg px-4 py-0.5 text-left text-[13px] font-medium ${r.isMe ? "shadow-[inset_2px_0_0_var(--accent)]" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`flex min-w-20 max-w-28 items-baseline gap-1.5 sm:max-w-40 ${r.isMe ? "text-accent" : ""}`}>
                    <span className="w-5 shrink-0 text-right text-[11px] font-normal tabular-nums text-muted">
                      {r.tied ? "T" : ""}
                      {r.place}
                    </span>
                    <span className="block truncate">{r.name}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums text-ink">{short$(r.total)}</span>
                </div>
              </th>
              {r.cells.map((c, i) => {
                const w = weeks[i];
                const id = `${r.userId}-${i}`;
                const open = detail === id;
                return (
                  <td key={i} className="relative h-9 min-w-[4.75rem] border-b border-line p-0 text-center">
                    {c.hidden ? (
                      <LockIcon className="mx-auto size-3 text-faint" />
                    ) : !c.golfer ? (
                      <span className="text-[11px] text-faint">{w.final ? "No pick" : ""}</span>
                    ) : (
                      <button type="button" onClick={() => setDetail(open ? null : id)} title={`${c.golfer}${c.finish ? ` · ${c.finish}` : ""}${c.final ? ` · ${money(c.earned)}` : ""}`} className="block h-full w-full px-1 leading-tight">
                        <div className="flex items-center justify-center gap-0.5 text-[11px] font-medium text-ink">
                          {c.won && (
                            <span className="text-[#b8860b] dark:text-[#e0b84c]">
                              <TrophyIcon className="size-2.5" />
                              <span className="sr-only">Won the tournament: </span>
                            </span>
                          )}
                          <span className="truncate">{lastName(c.golfer)}</span>
                        </div>
                        <div className={`text-[12px] tabular-nums ${c.final ? (c.earned > 0 ? `font-semibold ${c.topOfWeek ? "text-win" : "text-ink"}` : "text-muted") : "text-muted"}`}>
                          {c.final ? (c.earned > 0 ? short$(c.earned) : c.finish || "$0") : c.finish}
                          {c.topOfWeek && <span className="sr-only"> (top pick this week)</span>}
                        </div>
                      </button>
                    )}
                    {open && c.golfer && (
                      <div role="status" className="absolute left-1/2 top-full z-40 mt-1 w-44 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-left text-xs text-bg shadow-lg">
                        <div className="font-semibold">{c.golfer}</div>
                        <div className="opacity-80">
                          Wk {w.week} · {w.name}
                        </div>
                        <div className="tabular-nums">
                          {c.finish}
                          {c.final ? `${c.finish ? " · " : ""}${money(c.earned)}` : ""}
                        </div>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th className="sticky left-0 z-10 border-r border-t border-line bg-bg px-4 py-1.5 text-left text-xs font-medium text-muted">Pool Picks</th>
            {weeks.map((w) => (
              <td key={w.week} className="border-t border-line bg-bg px-1 py-1.5 text-center text-xs leading-tight">
                {w.popular ? (
                  <>
                    <div className="truncate text-muted">{lastName(w.popular.golfer)}</div>
                    <div className="font-semibold tabular-nums">{w.popular.count}</div>
                  </>
                ) : (
                  <LockIcon className="mx-auto size-3 text-muted" />
                )}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </AxisLockScroll>
  );
}
