import Link from "next/link";
import { points as fmt } from "@/lib/format";

export type TournamentRow = {
  userId: string;
  name: string;
  /** Points from decided tournaments. */
  points: number;
  /** Tournaments where they picked the champion. */
  champs: number;
};

/**
 * The Tournaments bonus line: every player's points from tournament champion picks, best first
 * (ties share a rank), and how many champions they picked. The picks themselves are on each
 * player's Pick History, which the name links to.
 */
export function TournamentStandings({
  rows,
  me,
  playerHref,
}: {
  rows: TournamentRow[];
  me: string;
  playerHref: (userId: string) => string;
}) {
  const sorted = [...rows].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const ranked = sorted.map((r) => ({ ...r, rank: 1 + sorted.findIndex((x) => x.points === r.points) }));
  return (
    <ul className="divide-y divide-line border-b border-line">
      {ranked.map((r) => {
        const mine = r.userId === me;
        return (
          <li key={r.userId} className="flex min-h-9 items-center gap-2 py-1.5 text-sm">
            <span className="w-6 text-right tabular-nums text-muted">{r.rank}</span>
            <span className="min-w-0 flex-1 truncate font-medium">
              <Link href={playerHref(r.userId)} className={`hover:underline ${mine ? "text-accent" : ""}`}>{r.name}</Link>
              {mine && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
            </span>
            {/* Each player's picks are on their Pick History (the name links there). */}
            <span className="w-14 text-right tabular-nums text-muted">{r.champs}</span>
            <span className="w-12 text-right font-semibold tabular-nums">{fmt(r.points)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Column labels matching TournamentStandings: Player · Champs · Pts. */
export function TournamentHeaderRow() {
  const head = "text-[11px] font-medium text-muted";
  return (
    <div className="flex items-end gap-2 border-b border-line pb-1.5 pt-2" aria-hidden>
      <span className="w-6" />
      <span className={`min-w-0 flex-1 ${head}`}>Player</span>
      <span className={`w-14 text-right ${head}`} title="Tournaments where they picked the champion">Champs</span>
      <span className={`w-12 text-right ${head}`}>Pts</span>
    </div>
  );
}
