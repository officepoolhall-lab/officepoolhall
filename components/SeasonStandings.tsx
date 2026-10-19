import Link from "next/link";
import { points } from "@/lib/format";
import { winPct } from "@/lib/record";
import type { StandingRow } from "@/lib/standings";

type WinLoss = Pick<StandingRow, "wins" | "losses" | "pushes">;
// "1,052–987–34": thousands separators (pool totals get big), one line always.
const n = (x: number) => x.toLocaleString("en-US");
const recordText = (r: WinLoss) => `${n(r.wins)}–${n(r.losses)}${r.pushes ? `–${n(r.pushes)}` : ""}`;

export type WeekScore = { points: number; possible: number };

/**
 * The Season tab: players in season order with their season record and win %, then this
 * week's points/possible and the current bonus segment's record. Phones show the season
 * columns only; the week and bonus columns appear from tablet width up.
 */
export function SeasonStandings({
  rows,
  me,
  flat,
  week,
  bonus,
  playerHref,
  compact = false,
  weekly = false,
  header = true,
}: {
  rows: StandingRow[];
  me: string;
  flat: boolean;
  /** This week's label and each player's points/possible, or null before any week. */
  week: { label: string; scores: Map<string, WeekScore> } | null;
  /** The current bonus segment's label and each player's record there, or null without segments. */
  bonus: { label: string; records: Map<string, WinLoss> } | null;
  /** Where a player's name links (their week-by-week history). */
  playerHref?: (userId: string) => string;
  /** 36px rows, for the three desktop columns. */
  compact?: boolean;
  /** A one-week table: a player without picks reads "No picks" instead of "1 missed". */
  weekly?: boolean;
  /** Draw the Player · Record · Win % row. Off when the page puts it in a frozen header. */
  header?: boolean;
}) {
  const total = rows.reduce(
    (t, r) => ({ wins: t.wins + r.wins, losses: t.losses + r.losses, pushes: t.pushes + r.pushes }),
    { wins: 0, losses: 0, pushes: 0 },
  );
  return (
    <>
      {header && <SeasonHeaderRow flat={flat} week={week} bonus={bonus} />}
      <ul className="divide-y divide-line border-b border-line">
      {rows.map((r) => {
        const mine = r.userId === me;
        const w = week?.scores.get(r.userId);
        const b = bonus?.records.get(r.userId);
        return (
          <li key={r.userId} className={`flex items-center gap-3 ${compact ? "min-h-9 py-1.5 text-sm" : "min-h-12 py-2.5"}`}>
            <span className="w-6 text-right text-sm tabular-nums text-muted">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {playerHref ? (
                <Link href={playerHref(r.userId)} className={`hover:underline ${mine ? "text-accent" : ""}`}>{r.name}</Link>
              ) : (
                <span className={mine ? "text-accent" : ""}>{r.name}</span>
              )}
              {mine && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
              {/* Their score comes from settings.missed_week (0 or the week's last place). */}
              {r.missed > 0 && <span className="ml-1.5 text-xs font-normal text-muted">{weekly ? "No picks" : `${r.missed} missed`}</span>}
            </span>
            <span className={`min-w-16 shrink-0 whitespace-nowrap text-right font-semibold tabular-nums ${compact ? "text-[15px]" : "text-[17px]"}`}>
              {recordText(r)}
              <span className="sr-only"> season record</span>
            </span>
            {!flat && <span className="w-14 text-right font-semibold tabular-nums">{points(r.points)}</span>}
            <span className="w-14 text-right text-sm tabular-nums text-muted">
              {winPct(r.wins, r.losses)}
              <span className="sr-only"> win percentage</span>
            </span>
            {week && (
              <span className="hidden w-20 text-right text-sm tabular-nums sm:block lg:hidden">
                {w ? (
                  <>
                    <span className="font-semibold text-ink">{points(w.points)}</span>
                    <span className="text-muted">/{points(w.possible)}</span>
                    <span className="sr-only"> {week.label} points of {points(w.possible)} possible</span>
                  </>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </span>
            )}
            {bonus && (
              <span className="hidden w-20 text-right text-sm tabular-nums text-muted sm:block lg:hidden">
                {b ? recordText(b) : "—"}
                <span className="sr-only"> {bonus.label} record</span>
              </span>
            )}
          </li>
        );
      })}

      {rows.length > 0 && (
        <li className={`flex items-center gap-3 text-muted ${compact ? "min-h-9 py-1.5" : "min-h-12 py-2.5"}`}>
          <span className="w-6" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">Pool total</span>
          <span className={`min-w-16 shrink-0 whitespace-nowrap text-right font-semibold tabular-nums text-ink ${compact ? "text-[15px]" : "text-[17px]"}`}>{recordText(total)}</span>
          {!flat && <span className="w-14" aria-hidden />}
          <span className="w-14 text-right text-sm tabular-nums">{winPct(total.wins, total.losses)}</span>
          {week && <span className="hidden w-20 sm:block lg:hidden" aria-hidden />}
          {bonus && <span className="hidden w-20 sm:block lg:hidden" aria-hidden />}
        </li>
      )}
      </ul>
    </>
  );
}

/** Pins a column's heading, buttons and column labels under the app's top bar (and, on
 *  phones, the tab row) while its rows scroll. */
export const FROZEN_HEAD =
  "sticky top-[calc(5.75rem+2px+env(safe-area-inset-top))] sm:top-[calc(3rem+1px+env(safe-area-inset-top))] z-10 bg-bg";

/** The Player · Record · Win % (· week · bonus) labels, matching SeasonStandings' columns. */
export function SeasonHeaderRow({
  flat,
  week,
  bonus,
}: {
  flat: boolean;
  week: { label: string } | null;
  bonus: { label: string } | null;
}) {
  const head = "text-[11px] font-medium text-muted";
  return (
<div className="flex items-end gap-3 border-b border-line pb-1.5 pt-2" aria-hidden>
    <span className="w-6" />
    <span className={`min-w-0 flex-1 ${head}`}>Player</span>
    <span className={`min-w-16 shrink-0 text-right ${head}`}>Record</span>
    {!flat && <span className={`w-14 text-right ${head}`}>Pts</span>}
    <span className={`w-14 text-right ${head}`}>Win %</span>
    {week && <span className={`hidden w-20 text-right sm:block lg:hidden ${head}`}>{week.label}</span>}
    {bonus && <span className={`hidden w-20 text-right sm:block lg:hidden ${head}`}>{bonus.label}</span>}
  </div>
  );
}
