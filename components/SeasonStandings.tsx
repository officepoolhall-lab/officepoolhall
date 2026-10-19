import { points } from "@/lib/format";
import { winPct } from "@/lib/record";
import type { StandingRow } from "@/lib/standings";

type WinLoss = Pick<StandingRow, "wins" | "losses" | "pushes">;
const recordText = (r: WinLoss) => `${r.wins}–${r.losses}${r.pushes ? `–${r.pushes}` : ""}`;

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
}: {
  rows: StandingRow[];
  me: string;
  flat: boolean;
  /** This week's label and each player's points/possible, or null before any week. */
  week: { label: string; scores: Map<string, WeekScore> } | null;
  /** The current bonus segment's label and each player's record there, or null without segments. */
  bonus: { label: string; records: Map<string, WinLoss> } | null;
}) {
  const total = rows.reduce(
    (t, r) => ({ wins: t.wins + r.wins, losses: t.losses + r.losses, pushes: t.pushes + r.pushes }),
    { wins: 0, losses: 0, pushes: 0 },
  );
  const head = "text-[11px] font-medium text-muted";

  return (
    <ul className="divide-y divide-line border-b border-line">
      <li className="flex items-end gap-3 pb-1.5 pt-2" aria-hidden>
        <span className="w-6" />
        <span className={`min-w-0 flex-1 ${head}`}>Player</span>
        <span className={`w-16 text-right ${head}`}>WinLoss</span>
        {!flat && <span className={`w-14 text-right ${head}`}>Pts</span>}
        <span className={`w-14 text-right ${head}`}>Win %</span>
        {week && <span className={`hidden w-20 text-right sm:block ${head}`}>{week.label}</span>}
        {bonus && <span className={`hidden w-20 text-right sm:block ${head}`}>{bonus.label}</span>}
      </li>

      {rows.map((r) => {
        const mine = r.userId === me;
        const w = week?.scores.get(r.userId);
        const b = bonus?.records.get(r.userId);
        return (
          <li key={r.userId} className="flex min-h-12 items-center gap-3 py-2.5">
            <span className="w-6 text-right text-sm tabular-nums text-muted">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate font-medium">
              <span className={mine ? "text-accent" : ""}>{r.name}</span>
              {mine && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
              {/* Their score comes from settings.missed_week (0 or the week's last place). */}
              {r.missed > 0 && <span className="ml-1.5 text-xs font-normal text-muted">{r.missed} missed</span>}
            </span>
            <span className="w-16 text-right text-[17px] font-semibold tabular-nums">
              {recordText(r)}
              <span className="sr-only"> season record</span>
            </span>
            {!flat && <span className="w-14 text-right font-semibold tabular-nums">{points(r.points)}</span>}
            <span className="w-14 text-right text-sm tabular-nums text-muted">
              {winPct(r.wins, r.losses)}
              <span className="sr-only"> win percentage</span>
            </span>
            {week && (
              <span className="hidden w-20 text-right text-sm tabular-nums sm:block">
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
              <span className="hidden w-20 text-right text-sm tabular-nums text-muted sm:block">
                {b ? recordText(b) : "—"}
                <span className="sr-only"> {bonus.label} record</span>
              </span>
            )}
          </li>
        );
      })}

      {rows.length > 0 && (
        <li className="flex min-h-12 items-center gap-3 py-2.5 text-muted">
          <span className="w-6" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">Pool total</span>
          <span className="w-16 text-right text-[17px] font-semibold tabular-nums text-ink">{recordText(total)}</span>
          {!flat && <span className="w-14" aria-hidden />}
          <span className="w-14 text-right text-sm tabular-nums">{winPct(total.wins, total.losses)}</span>
          {week && <span className="hidden w-20 sm:block" aria-hidden />}
          {bonus && <span className="hidden w-20 sm:block" aria-hidden />}
        </li>
      )}
    </ul>
  );
}
