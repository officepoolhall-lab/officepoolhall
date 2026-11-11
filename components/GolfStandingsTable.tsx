"use client";

import { Fragment, useState } from "react";
import type { StandingRow } from "@/lib/golfStandings";
import { ChevronIcon, LockIcon } from "./ui";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Move({ move }: { move: number | null }) {
  if (move === null || move === 0) return <span className="text-faint">–</span>;
  return (
    <span className={`font-semibold ${move > 0 ? "text-win" : "text-loss"}`}>
      {move > 0 ? "▲" : "▼"}
      {Math.abs(move)}
      <span className="sr-only">{move > 0 ? ` up ${move}` : ` down ${-move}`}</span>
    </span>
  );
}

function ThisWeek({ pick }: { pick: StandingRow["thisWeek"] }) {
  if (!pick) return null;
  if (pick.hidden)
    return (
      <span className="inline-flex items-center gap-1 text-faint">
        <LockIcon className="size-3" /> Hidden
      </span>
    );
  if (!pick.golfer) return <span className="text-faint">No pick</span>;
  return (
    <>
      <span className="font-medium">{pick.golfer}</span>
      {pick.live && <span className="ml-1.5 text-xs tabular-nums text-muted">{pick.live}</span>}
    </>
  );
}

/**
 * The season standings. Computers show every column; phones show place, entry (with this
 * week's pick) and total. Clicking an entry opens its season stats and week-by-week log.
 */
export function GolfStandingsTable({
  rows,
  hasCurrent,
  hasLastWeek,
}: {
  rows: StandingRow[];
  /** Whether there's a current event (the "This week" column). */
  hasCurrent: boolean;
  hasLastWeek: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // Columns: place, move, entry, [this week], [last week], best, cuts, top 10s, wins, missed, behind, total.
  const columns = 9 + (hasCurrent ? 1 : 0) + (hasLastWeek ? 1 : 0);
  const th = "py-2 font-medium";

  return (
    <div className="border-y border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className={`${th} w-8 pr-1 text-right`}>#</th>
            <th className={`${th} w-9 px-1 text-center`}>
              <span className="sr-only">Change</span>
            </th>
            <th className={`${th} px-2`}>Entry</th>
            {hasCurrent && <th className={`${th} hidden px-2 md:table-cell`}>This week</th>}
            {hasLastWeek && <th className={`${th} hidden px-2 text-right lg:table-cell`}>Last week</th>}
            <th className={`${th} hidden px-2 text-right xl:table-cell`}>Best week</th>
            <th className={`${th} hidden px-2 text-right xl:table-cell`}>Cuts</th>
            <th className={`${th} hidden px-2 text-right xl:table-cell`}>Top 10s</th>
            <th className={`${th} hidden px-2 text-right xl:table-cell`}>Wins</th>
            <th className={`${th} hidden px-2 text-right xl:table-cell`}>Missed</th>
            <th className={`${th} hidden px-2 text-right sm:table-cell`}>Behind</th>
            <th className={`${th} pl-2 text-right`}>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const isOpen = open === r.userId;
            return (
              <Fragment key={r.userId}>
                <tr id={r.isMe ? "my-row" : undefined} className={`scroll-mt-24 ${r.isMe ? "bg-surface font-semibold" : ""}`}>
                  <td className="py-2 pr-1 text-right tabular-nums text-muted">
                    {r.tied ? "T" : ""}
                    {r.place}
                  </td>
                  <td className="px-1 py-2 text-center text-xs tabular-nums">
                    <Move move={r.move} />
                  </td>
                  <td className="w-full max-w-0 px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : r.userId)}
                      aria-expanded={isOpen}
                      className="flex max-w-full items-center gap-1 text-left hover:text-accent"
                    >
                      <span className="truncate">{r.name}</span>
                      <ChevronIcon className={`size-3.5 shrink-0 text-muted transition ${isOpen ? "rotate-90" : ""}`} />
                    </button>
                    {/* Phones: this week's pick sits under the name. */}
                    {hasCurrent && (
                      <div className="truncate text-xs font-normal md:hidden">
                        <ThisWeek pick={r.thisWeek} />
                      </div>
                    )}
                  </td>
                  {hasCurrent && (
                    <td className="hidden max-w-[14rem] truncate px-2 py-2 font-normal md:table-cell">
                      <ThisWeek pick={r.thisWeek} />
                    </td>
                  )}
                  {hasLastWeek && (
                    <td className="hidden px-2 py-2 text-right font-normal tabular-nums lg:table-cell">
                      {r.lastWeek?.golfer ? (
                        <>
                          <span className="mr-1.5 text-xs text-muted">
                            {r.lastWeek.golfer.split(" ").slice(-1)[0]} {r.lastWeek.finish}
                          </span>
                          {money(r.lastWeek.earned)}
                        </>
                      ) : (
                        <span className="text-faint">No pick</span>
                      )}
                    </td>
                  )}
                  <td className="hidden px-2 py-2 text-right font-normal tabular-nums xl:table-cell">{r.best ? money(r.best.earned) : "–"}</td>
                  <td className="hidden px-2 py-2 text-right font-normal tabular-nums xl:table-cell">
                    {r.cuts}/{r.picks}
                  </td>
                  <td className="hidden px-2 py-2 text-right font-normal tabular-nums xl:table-cell">{r.top10s}</td>
                  <td className="hidden px-2 py-2 text-right font-normal tabular-nums xl:table-cell">{r.wins}</td>
                  <td className={`hidden px-2 py-2 text-right font-normal tabular-nums xl:table-cell ${r.missed ? "text-loss" : ""}`}>{r.missed}</td>
                  <td className="hidden px-2 py-2 text-right font-normal tabular-nums text-muted sm:table-cell">{r.behind > 0 ? `−${money(r.behind)}` : "–"}</td>
                  <td className="py-2 pl-2 text-right font-semibold tabular-nums">{money(r.total)}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={columns + 1} className="bg-surface/60 px-3 py-3">
                      <Details row={r} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One entry's season: the stats (all of them, for phones that hide those columns) and its log. */
function Details({ row }: { row: StandingRow }) {
  const stats: [string, string][] = [
    ["Behind leader", row.behind > 0 ? money(row.behind) : "Leader"],
    ["Best week", row.best ? `${money(row.best.earned)} · ${row.best.golfer.split(" ").slice(-1)[0]}` : "–"],
    ["Cuts made", `${row.cuts} of ${row.picks}`],
    ["Top 10s", String(row.top10s)],
    ["Wins", String(row.wins)],
    ["Weeks won", String(row.weeklyWins)],
    ["Weeks missed", String(row.missed)],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 self-start text-sm lg:grid-cols-1">
        {stats.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="truncate font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {row.log.length === 0 ? (
        <p className="text-sm text-muted">No events have been played yet.</p>
      ) : (
        <table className="w-full table-fixed self-start text-xs sm:text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="w-8 py-1 font-medium">Wk</th>
              <th className="py-1 pr-2 font-medium">Tournament</th>
              <th className="py-1 pr-2 font-medium">Golfer</th>
              <th className="w-12 py-1 font-medium">Finish</th>
              <th className="w-24 py-1 text-right font-medium">Earnings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {row.log.map((l) => (
              <tr key={l.week}>
                <td className="py-1 tabular-nums text-muted">{l.week}</td>
                <td className="truncate py-1 pr-2">{l.event}</td>
                <td className={`truncate py-1 pr-2 ${l.golfer ? "font-medium" : "text-muted"}`}>{l.golfer ?? "No pick"}</td>
                <td className="py-1 tabular-nums text-muted">
                  {l.finish}
                  {!l.final && <span className="ml-1 text-live">Live</span>}
                </td>
                <td className={`py-1 text-right tabular-nums ${l.earned > 0 ? "font-semibold" : "text-muted"}`}>{l.final ? money(l.earned) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
