"use client";

import { Suspense, use, useEffect, useRef } from "react";
import type { FieldHistory } from "@/lib/golfFieldHistory";
import { buttonClass } from "./ui";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const place = (pos: string | null) => parseInt((pos ?? "").replace(/^T/, ""), 10);

/**
 * A golfer's record: the last few years at the event being picked for, then this season so far
 * (each event played with finish and prize money, plus a short summary). Opens over the page; "Pick" chooses them from here when they're available.
 */
export function GolferHistoryDialog({
  golfer,
  history,
  onClose,
  onPick,
}: {
  golfer: { id: string; name: string; rank: number | null };
  /** Past results for the whole field, already loading with the page. */
  history: Promise<FieldHistory>;
  onClose: () => void;
  /** Absent when the golfer can't be picked (already used). */
  onPick?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      // A click on the dimmed area around the panel closes it.
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl bg-bg p-0 text-ink shadow-xl backdrop:bg-black/50"
      aria-label={`${golfer.name}: results`}
    >
      <div className="max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{golfer.name}</h2>
            <p className="text-xs text-muted">
              {golfer.rank ? `World Rank #${golfer.rank}` : "Outside the World Top 300"}
            </p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className="-mr-1.5 -mt-1 grid size-9 place-items-center rounded-full text-xl text-muted hover:bg-surface" aria-label="Close">
            ×
          </button>
        </div>

        <Suspense fallback={<p className="mt-4 text-sm text-muted">Loading…</p>}>
          <Results golferId={golfer.id} history={history} />
        </Suspense>

        <div className="mt-4 flex justify-end">
          {onPick && (
            <button
              type="button"
              className={buttonClass("primary")}
              onClick={() => {
                onPick();
                dialog.current?.close();
              }}
            >
              Select {golfer.name.split(" ").slice(-1)[0]}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

/** The two sections, once the field's history has arrived. */
function Results({ golferId, history }: { golferId: string; history: Promise<FieldHistory> }) {
  const data = use(history);
  const atYears = data.years.map((y, i) => ({ ...y, result: data.at[golferId]?.[i] ?? null }));
  const rows = (data.season[golferId] ?? []).map((r) => ({ ...data.played[r.i], pos: r.pos, earnings: r.earnings }));
  const eventsPlayed = data.played.length;
  const finished = rows.filter((r) => r.final);
  const cuts = finished.filter((r) => Number.isFinite(place(r.pos))).length;
  const best = finished.map((r) => place(r.pos)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const bestLabel = best === undefined ? "–" : (finished.find((r) => place(r.pos) === best)?.pos ?? "–");
  const top10 = finished.filter((r) => place(r.pos) <= 10).length;
  const total = finished.reduce((sum, r) => sum + r.earnings, 0);

  return (
          <>
            {/* The last few years at the event being picked for. */}
            {(
              <section className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">At the {data.eventName.replace(/^the /i, "")}</h3>
                {atYears.length === 0 ? (
                  <p className="mt-2 border-y border-line py-3 text-sm text-muted">Earlier years of this tournament aren&apos;t available.</p>
                ) : (
                  <table className="mt-2 w-full table-fixed border-y border-line text-xs sm:text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="w-14 py-2 font-medium">Year</th>
                        <th className="py-2 font-medium">Finish</th>
                        <th className="w-16 py-2 font-medium">Score</th>
                        <th className="w-24 py-2 text-right font-medium">Earnings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {atYears.map((y) => (y.result ? { ...y, played: true as const, ...y.result } : { ...y, played: false as const, pos: null, toPar: null, earnings: 0 })).map((y) => (
                        <tr key={y.year}>
                          <td className="py-1.5 align-top tabular-nums text-muted">{y.year}</td>
                          {y.played ? (
                            <>
                              <td className="py-1.5">
                                <span className={`tabular-nums ${Number.isFinite(place(y.pos)) ? "font-semibold" : "text-muted"}`}>{y.pos ?? "–"}</span>
                                {y.formerName && <span className="block truncate text-[11px] text-faint">{y.formerName}</span>}
                              </td>
                              {/* Golf's convention: under par in red. */}
                              <td className={`py-1.5 align-top tabular-nums ${y.toPar?.startsWith("-") ? "text-loss" : ""}`}>{y.toPar ? y.toPar.replace(/^-/, "−") : ""}</td>
                              <td className={`py-1.5 text-right align-top tabular-nums ${y.earnings > 0 ? "font-semibold" : "text-muted"}`}>{money(y.earnings)}</td>
                            </>
                          ) : (
                            <td colSpan={3} className="py-1.5 text-muted">
                              Did Not Play
                              {y.formerName && <span className="block truncate text-[11px] text-faint">{y.formerName}</span>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}

            <section className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">This Season</h3>
              {rows.length === 0 ? (
                <p className="mt-2 border-y border-line py-3 text-sm text-muted">
                  {eventsPlayed === 0 ? "No events have been played yet this season." : `Hasn't played in any of the ${eventsPlayed} events so far this season.`}
                </p>
              ) : (
                <>
                  <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
                    {[
                      ["Events", `${rows.length} of ${eventsPlayed}`],
                      ["Cuts Made", `${cuts} of ${finished.length}`],
                      ["Best", bestLabel],
                      ["Top 10s", String(top10)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-surface px-1 py-2">
                        <dt className="text-[11px] text-muted">{label}</dt>
                        <dd className="text-sm font-bold tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <table className="mt-3 w-full table-fixed border-y border-line text-xs sm:text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="w-8 py-2 font-medium">Wk</th>
                        <th className="py-2 pr-2 font-medium">Tournament</th>
                        <th className="w-14 py-2 font-medium">Finish</th>
                        <th className="w-24 py-2 text-right font-medium">Earnings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((r) => (
                        <tr key={r.week}>
                          <td className="py-1.5 tabular-nums text-muted">{r.week}</td>
                          <td className="truncate py-1.5 pr-2">{r.name}</td>
                          <td className="py-1.5 tabular-nums">
                            {r.pos && r.pos !== "-" ? r.pos : r.final ? <span className="text-muted">MC</span> : ""}
                            {!r.final && <span className="ml-1 text-live">Live</span>}
                          </td>
                          <td className={`py-1.5 text-right tabular-nums ${r.earnings > 0 ? "font-semibold" : "text-muted"}`}>{r.final ? money(r.earnings) : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-line">
                        <td colSpan={3} className="py-2 text-muted">Season Prize Money</td>
                        <td className="py-2 text-right font-bold tabular-nums">{money(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </section>
          </>
  );
}
