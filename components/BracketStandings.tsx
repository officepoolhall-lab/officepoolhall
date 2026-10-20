import Link from "next/link";
import { points as fmt } from "@/lib/format";

export type BracketRow = { userId: string; name: string; points: number; correct: number; possible: number; filled: boolean };

/**
 * NCAA Tournament bracket standings, its own line: points (correct picks, weighted by round
 * and seed), how many picks were right, and the most each bracket can still reach. Names link
 * to the player's bracket once brackets lock.
 */
export function BracketStandings({ rows, me, locked, bracketHref }: { rows: BracketRow[]; me: string; locked: boolean; bracketHref: (userId: string) => string }) {
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.possible - a.possible || a.name.localeCompare(b.name));
  return (
    <ul className="divide-y divide-line border-b border-line">
      {sorted.map((r) => {
        const mine = r.userId === me;
        const rank = 1 + sorted.findIndex((x) => x.points === r.points);
        return (
          <li key={r.userId} className="flex min-h-9 items-center gap-2 py-1.5 text-sm">
            <span className="w-6 text-right tabular-nums text-muted">{rank}</span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {locked || mine ? (
                <Link href={bracketHref(r.userId)} className={`hover:underline ${mine ? "text-accent" : ""}`}>{r.name}</Link>
              ) : (
                <span className={mine ? "text-accent" : ""}>{r.name}</span>
              )}
              {mine && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
              {locked && !r.filled && <span className="ml-1.5 text-xs font-normal text-muted">No bracket</span>}
            </span>
            <span className="w-12 text-right tabular-nums text-muted">{locked ? r.correct : ""}</span>
            <span className="w-12 text-right tabular-nums text-muted">{locked ? fmt(r.possible) : ""}</span>
            <span className="w-12 text-right font-semibold tabular-nums">{fmt(r.points)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function BracketHeaderRow() {
  const head = "text-[11px] font-medium text-muted";
  return (
    <div className="flex items-end gap-2 border-b border-line pb-1.5 pt-2" aria-hidden>
      <span className="w-6" />
      <span className={`min-w-0 flex-1 ${head}`}>Player</span>
      <span className={`w-12 text-right ${head}`}>Right</span>
      <span className={`w-12 text-right ${head}`}>Max</span>
      <span className={`w-12 text-right ${head}`}>Pts</span>
    </div>
  );
}
