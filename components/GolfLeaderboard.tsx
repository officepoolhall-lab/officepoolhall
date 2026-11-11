"use client";

import { Fragment, useState } from "react";
import { AxisLockScroll } from "./AxisLockScroll";
import { GolfScorecard } from "./GolfScorecard";

export type LeaderRow = {
  id: string;
  name: string;
  country: string | null;
  /** The country's flag image, when known. */
  flag: string | null;
  /** "1", "T7"; "MC"/"WD" for a golfer out of the event; "" before it starts. */
  pos: string;
  toPar: string | null;
  /** "F", "14" (holes played), or a tee time label ("Thu 7:40 AM") for a golfer yet to start the round. */
  thru: string | null;
  rounds: (number | null)[];
  /** Score to par for the round being played, for a golfer part-way through it ("-2"); else null. */
  today: string | null;
  earnings: number;
  /** How many entries picked this golfer (only counted once picks are visible). */
  pickedBy: number;
  mine: boolean;
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const toParText = (t: string | null) => (t ? t.replace(/^-/, "−") : "");

/**
 * A tournament's leaderboard: place, golfer, score to par, holes played, each round and the
 * total (prize money once final). Golfers picked in the pool are marked, the viewer's own pick
 * outlined. Missed cuts sit below a cut line. Selecting a golfer opens their scorecard.
 */
export function GolfLeaderboard({
  rows,
  round,
  state,
  tournamentId,
  eventName,
}: {
  rows: LeaderRow[];
  /** The round being played, while live. */
  round?: number | null;
  state: "scheduled" | "live" | "final";
  /** ESPN's tournament, for scorecards; null when there's none to read. */
  tournamentId: string | null;
  eventName: string;
}) {
  const [open, setOpen] = useState<LeaderRow | null>(null);
  const started = state !== "scheduled";
  const cutAt = rows.findIndex((r) => /^(MC|CUT)$/.test(r.pos));
  const th = "py-2 text-[11px] font-medium text-muted";

  return (
    <>
      {/* Its own scroll box filling the screen (as on the League Grid): the column labels stay
          pinned at its top, so they never slide under the app's header. */}
      <AxisLockScroll className="relative -mx-4 min-h-0 flex-1 overflow-auto isolate sm:mx-0">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-bg">
            <tr className="text-left">
              <th className={`${th} w-12 border-b border-line pl-4 pr-1 sm:pl-0`}>{started ? "Pos" : ""}</th>
              <th className={`${th} border-b border-line px-2`}>Golfer</th>
              {started ? (
                <>
                  <th className={`${th} w-14 border-b border-line px-1 text-right`}>To par</th>
                  <th className={`${th} w-16 border-b border-line px-1 text-right`}>{state === "final" ? "" : "Thru"}</th>
                  {[1, 2, 3, 4].map((n) => (
                    <th key={n} className={`${th} hidden w-10 border-b border-line px-1 text-right sm:table-cell`}>
                      R{n}
                    </th>
                  ))}
                  {state === "final" && <th className={`${th} hidden w-28 border-b border-line pl-2 pr-4 text-right md:table-cell md:pr-0`}>Earnings</th>}
                </>
              ) : (
                <th className={`${th} w-32 border-b border-line pl-2 pr-4 text-right sm:pr-0`}>Tee time</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <Fragment key={r.id}>
                {i === cutAt && (
                  <tr>
                    <td colSpan={11} className="border-b border-line bg-surface px-4 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted sm:px-0">
                      Missed the cut
                    </td>
                  </tr>
                )}
                <tr
                  onClick={() => started && tournamentId && setOpen(r)}
                  className={`${started && tournamentId ? "cursor-pointer hover:bg-surface" : ""} ${r.mine ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : ""}`}
                >
                  <td className={`border-b border-line py-2 pl-4 pr-1 tabular-nums text-muted sm:pl-0 ${r.mine ? "shadow-[inset_2px_0_0_var(--accent)] sm:shadow-none" : ""}`}>{r.pos}</td>
                  <td className="border-b border-line px-2 py-2">
                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                      {started && tournamentId ? (
                        <button type="button" className={`text-left font-medium hover:underline ${r.mine ? "text-accent" : ""}`} onClick={(e) => (e.stopPropagation(), setOpen(r))}>
                          {r.name}
                        </button>
                      ) : (
                        <span className={`font-medium ${r.mine ? "text-accent" : ""}`}>{r.name}</span>
                      )}
                      {r.flag && (
                        // eslint-disable-next-line @next/next/no-img-element -- ESPN's flag image, as with team logos
                        <img
                          src={r.flag}
                          alt={r.country ?? ""}
                          title={r.country ?? undefined}
                          loading="lazy"
                          className="h-3 w-4 shrink-0 self-center rounded-[2px] object-cover"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      )}
                      {r.pickedBy > 0 && (
                        <span className="whitespace-nowrap rounded-full bg-surface px-1.5 text-[10px] font-medium text-muted" title={`Picked by ${r.pickedBy} ${r.pickedBy === 1 ? "entry" : "entries"}`}>
                          {r.mine ? "Your pick" : "Picked"}
                          {r.pickedBy > 1 || !r.mine ? ` ×${r.pickedBy}` : ""}
                        </span>
                      )}
                    </div>
                  </td>
                  {started ? (
                    <>
                      <td className={`border-b border-line px-1 py-2 text-right font-semibold tabular-nums ${r.toPar?.startsWith("-") ? "text-loss" : ""}`}>{toParText(r.toPar)}</td>
                      <td className="border-b border-line px-1 py-2 text-right text-xs tabular-nums text-muted">{state === "final" ? "" : r.thru}</td>
                      {[0, 1, 2, 3].map((n) => {
                        // The round being played shows the score to par so far for a golfer on the course.
                        const live = r.today !== null && round === n + 1 && r.rounds[n] === null;
                        return (
                          <td
                            key={n}
                            className={`hidden border-b border-line px-1 py-2 text-right tabular-nums sm:table-cell ${
                              live ? `font-semibold ${r.today!.startsWith("-") ? "text-loss" : "text-ink"}` : "text-muted"
                            }`}
                          >
                            {live ? r.today!.replace(/^-/, "−") : (r.rounds[n] ?? "")}
                          </td>
                        );
                      })}
                      {state === "final" && (
                        <td className={`hidden border-b border-line py-2 pl-2 pr-4 text-right tabular-nums md:table-cell md:pr-0 ${r.earnings > 0 ? "" : "text-muted"}`}>{r.earnings > 0 ? money(r.earnings) : "–"}</td>
                      )}
                    </>
                  ) : (
                    <td className="border-b border-line py-2 pl-2 pr-4 text-right text-xs tabular-nums text-muted sm:pr-0">{r.thru ?? "TBA"}</td>
                  )}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </AxisLockScroll>
      {started && <p className="mt-1.5 shrink-0 text-[11px] text-muted">Select a golfer for their scorecard. Under par in red.</p>}
      {open && tournamentId && <GolfScorecard key={open.id} tournamentId={tournamentId} eventName={eventName} golfer={open} live={state === "live"} onClose={() => setOpen(null)} />}
    </>
  );
}
