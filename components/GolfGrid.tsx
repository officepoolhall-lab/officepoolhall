"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { LockIcon } from "./ui";

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

/** Green by prize money, darker for more; grey for a missed cut; faint red for no pick. */
function shade(c: GridCell): string {
  if (c.hidden) return "";
  if (!c.golfer) return c.final ? "bg-[color-mix(in_srgb,var(--loss)_9%,transparent)]" : "";
  if (!c.final) return "";
  if (c.earned <= 0) return "bg-[color-mix(in_srgb,var(--muted)_14%,transparent)]";
  const pct = c.earned >= 1_500_000 ? 60 : c.earned >= 500_000 ? 44 : c.earned >= 200_000 ? 30 : c.earned >= 50_000 ? 19 : 10;
  return `bg-[color-mix(in_srgb,var(--win)_${pct}%,transparent)]`;
}

/**
 * The League Grid: entries down the left in standings order, tournaments across the top up to
 * the current week. Both stay pinned while the grid scrolls, and it opens scrolled to the
 * current week. Each cell is shaded by what the pick earned; a tap or hover shows the details.
 */
export function GolfGrid({ rows, weeks }: { rows: GridRow[]; weeks: GridWeek[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => {
    const el = scroller.current;
    // Open on the latest weeks (the right end).
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const me = rows.find((r) => r.isMe);
  // Shades are only Tailwind classes if spelled out somewhere; list them for the build.
  // bg-[color-mix(in_srgb,var(--win)_10%,transparent)] bg-[color-mix(in_srgb,var(--win)_19%,transparent)]
  // bg-[color-mix(in_srgb,var(--win)_30%,transparent)] bg-[color-mix(in_srgb,var(--win)_44%,transparent)]
  // bg-[color-mix(in_srgb,var(--win)_60%,transparent)]

  const nameCell = (r: GridRow, extra = "") => (
    <th
      scope="row"
      className={`sticky left-0 z-10 w-[7.5rem] min-w-[7.5rem] border-r border-line px-2 py-1.5 text-left font-normal sm:w-44 sm:min-w-44 ${
        r.isMe ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))]" : "bg-bg"
      } ${extra}`}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">
          {r.tied ? "T" : ""}
          {r.place}
        </span>
        <span className={`min-w-0 break-words text-[13px] font-semibold leading-tight sm:text-sm ${r.isMe ? "text-accent" : ""}`}>{r.name}</span>
      </div>
      <div className="pl-[1.875rem] text-[11px] tabular-nums text-muted">{money(r.total)}</div>
    </th>
  );

  const cell = (r: GridRow, c: GridCell, w: GridWeek, i: number, key: string) => {
    const id = `${key}-${i}`;
    const open = detail === id;
    const label = c.hidden
      ? "Hidden until the lock"
      : !c.golfer
        ? "No pick"
        : `${c.golfer}${c.finish ? ` · ${c.finish}` : ""}${c.final ? ` · ${money(c.earned)}` : ""}`;
    return (
      <td key={i} className={`relative border-r border-line/60 p-0 ${r.isMe ? "bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]" : ""}`}>
        <button
          type="button"
          title={`${w.name}: ${label}`}
          onClick={() => setDetail(open ? null : id)}
          className={`flex h-full min-h-12 w-full flex-col items-center justify-center px-1.5 py-1 text-center ${shade(c)} ${
            c.topOfWeek ? "outline outline-2 -outline-offset-2 outline-ink" : ""
          }`}
        >
          {c.hidden ? (
            <LockIcon className="size-3.5 text-faint" />
          ) : !c.golfer ? (
            <span className={`text-[11px] ${c.final ? "text-loss" : "text-faint"}`}>{c.final ? "No pick" : "–"}</span>
          ) : (
            <>
              <span className="flex items-center gap-1 text-[13px] font-semibold leading-tight">
                {c.won && <span aria-label="Won the tournament" className="size-2 rounded-full bg-[#d4a017]" />}
                {lastName(c.golfer)}
              </span>
              <span className="text-[10.5px] leading-tight tabular-nums text-muted">
                {c.final ? `${c.finish}${c.finish ? " · " : ""}${c.earned > 0 ? short$(c.earned) : "$0"}` : c.finish || (w.live ? "Live" : "")}
              </span>
            </>
          )}
        </button>
        {open && (
          <div role="status" className="absolute left-1/2 top-full z-30 mt-1 w-44 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-left text-xs text-bg shadow-lg">
            <div className="font-semibold">{c.hidden ? "Hidden" : (c.golfer ?? "No pick")}</div>
            <div className="opacity-80">
              Wk {w.week} · {w.name}
            </div>
            {!c.hidden && c.golfer && (
              <div className="tabular-nums">
                {c.finish}
                {c.final ? `${c.finish ? " · " : ""}${money(c.earned)}` : ""}
              </div>
            )}
          </div>
        )}
      </td>
    );
  };

  return (
    <>
      <div ref={scroller} className="max-h-[calc(100dvh-11rem)] overflow-auto overscroll-x-contain rounded-lg border border-line" onScroll={() => detail && setDetail(null)}>
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-b border-r border-line bg-bg px-2 py-2 text-left text-[11px] font-medium text-muted">Entry</th>
              {weeks.map((w) => (
                <th
                  key={w.week}
                  scope="col"
                  title={w.name}
                  className={`sticky top-0 z-[15] w-24 min-w-24 border-b border-r border-line/60 px-1.5 py-1.5 text-center font-normal sm:w-28 sm:min-w-28 ${
                    w.live || w.open ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg))]" : "bg-bg"
                  }`}
                >
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                    Wk {w.week}
                    {w.live && <span className="ml-1 text-live">● Live</span>}
                    {w.open && <span className="ml-1 text-accent">Open</span>}
                  </div>
                  <div className="truncate text-xs font-semibold leading-tight">{w.short}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Phones: your own row first, so it's in view without scrolling down. */}
            {me && rows.length > 8 && (
              <tr className="sm:hidden">
                {nameCell(me, "border-b-2 border-b-line")}
                {me.cells.map((c, i) => (
                  <Fragment key={i}>{cell(me, c, weeks[i], i, "pinned")}</Fragment>
                ))}
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.userId} className="[&>*]:border-b [&>*]:border-line/60">
                {nameCell(r)}
                {r.cells.map((c, i) => cell(r, c, weeks[i], i, r.userId))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="sticky bottom-0 left-0 z-20 border-r border-t border-line bg-bg px-2 py-1.5 text-left text-[11px] font-medium text-muted">
                Most picked
              </th>
              {weeks.map((w) => (
                <td key={w.week} className="sticky bottom-0 z-[15] border-r border-t border-line/60 bg-bg px-1.5 py-1.5 text-center text-xs">
                  {w.popular ? (
                    <>
                      <span className="font-medium">{lastName(w.popular.golfer)}</span> <span className="tabular-nums text-muted">×{w.popular.count}</span>
                    </>
                  ) : (
                    <span className="text-faint">–</span>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted" aria-label="Key">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-8 rounded-sm bg-[linear-gradient(to_right,color-mix(in_srgb,var(--win)_10%,transparent),color-mix(in_srgb,var(--win)_60%,transparent))]" />
          Prize money
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[color-mix(in_srgb,var(--muted)_14%,transparent)]" /> Missed cut / $0
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-[color-mix(in_srgb,var(--loss)_9%,transparent)]" /> No pick
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#d4a017]" /> Won the tournament
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm outline outline-2 -outline-offset-2 outline-ink" /> Week&apos;s top pick
        </li>
      </ul>
    </>
  );
}
