import Link from "next/link";
import type { StandingRow } from "@/lib/golfStandings";
import { LockIcon } from "./ui";

// The golf Standings columns, laid out like the football and basketball ones
// (SeasonStandings): 36px rows, place, player, the numbers right-aligned.

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const head = "text-[11px] font-medium text-muted";

function Player({ r, href }: { r: { userId: string; name: string; isMe: boolean }; href: (userId: string) => string }) {
  return (
    <>
      <Link href={href(r.userId)} className={`hover:underline ${r.isMe ? "text-accent" : ""}`}>
        {r.name}
      </Link>
      {r.isMe && <span className="ml-1.5 text-xs font-normal text-muted">You</span>}
    </>
  );
}

/** Player · Cuts · Earnings, matching GolfSeasonStandings' columns. */
export function GolfSeasonHeaderRow() {
  return (
    <div className="flex items-end gap-3 border-b border-line pb-1.5 pt-2" aria-hidden>
      <span className="w-7" />
      <span className={`min-w-0 flex-1 ${head}`}>Player</span>
      <span className={`w-12 text-right ${head}`}>Cuts</span>
      <span className={`w-24 text-right ${head}`}>Behind</span>
      <span className={`w-28 text-right ${head}`}>Earnings</span>
    </div>
  );
}

/** The season: everyone by prize money, with cuts made and the gap to the leader. */
export function GolfSeasonStandings({ rows, playerHref }: { rows: StandingRow[]; playerHref: (userId: string) => string }) {
  return (
    <ul className="divide-y divide-line border-b border-line">
      {rows.map((r) => (
        <li key={r.userId} className="flex min-h-9 items-center gap-3 py-1.5 text-sm">
          <span className="w-7 text-right text-sm tabular-nums text-muted">
            {r.tied ? "T" : ""}
            {r.place}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            <Player r={r} href={playerHref} />
            {r.missed > 0 && <span className="ml-1.5 text-xs font-normal text-muted">{r.missed} missed</span>}
          </span>
          <span className="w-12 text-right text-sm tabular-nums text-muted">
            {r.cuts}/{r.picks}
            <span className="sr-only"> cuts made</span>
          </span>
          <span className="w-24 text-right text-sm tabular-nums text-muted">{r.behind > 0 ? `−${money(r.behind)}` : "–"}</span>
          <span className="w-28 text-right text-[15px] font-semibold tabular-nums">{money(r.total)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Player · Golfer · Earnings, matching GolfWeekStandings' columns. */
export function GolfWeekHeaderRow({ final }: { final: boolean }) {
  return (
    <div className="flex items-end gap-3 border-b border-line pb-1.5 pt-2" aria-hidden>
      <span className="w-7" />
      <span className={`min-w-0 flex-1 ${head}`}>Player</span>
      <span className={`min-w-0 flex-1 ${head}`}>Golfer</span>
      <span className={`w-24 text-right ${head}`}>{final ? "Earnings" : "Now"}</span>
    </div>
  );
}

export type WeekRow = {
  userId: string;
  name: string;
  isMe: boolean;
  place: number | null;
  tied: boolean;
  golfer: string | null;
  /** Picks for an open event are hidden from everyone but the entry itself. */
  hidden: boolean;
  /** "T7", "MC"; or the live line ("T12 · −4 · Thru 9") while the event is under way. */
  finish: string;
  earned: number;
};

/** One event: everyone's golfer, where they finished and what they earned, best first. */
export function GolfWeekStandings({ rows, final, playerHref }: { rows: WeekRow[]; final: boolean; playerHref: (userId: string) => string }) {
  return (
    <ul className="divide-y divide-line border-b border-line">
      {rows.map((r) => (
        <li key={r.userId} className="flex min-h-9 items-center gap-3 py-1.5 text-sm">
          <span className="w-7 text-right text-sm tabular-nums text-muted">
            {r.place === null ? "" : `${r.tied ? "T" : ""}${r.place}`}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">
            <Player r={r} href={playerHref} />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {r.hidden ? (
              <span className="inline-flex items-center gap-1 text-xs text-faint">
                <LockIcon className="size-3" /> Hidden until the lock
              </span>
            ) : r.golfer ? (
              <>
                {r.golfer}
                {final && r.finish && <span className="ml-1.5 text-xs tabular-nums text-muted">{r.finish}</span>}
              </>
            ) : (
              <span className="text-xs text-muted">No pick</span>
            )}
          </span>
          <span className={`w-24 text-right tabular-nums ${final ? (r.earned > 0 ? "text-[15px] font-semibold" : "text-muted") : "text-xs text-muted"}`}>
            {final ? money(r.earned) : r.finish}
          </span>
        </li>
      ))}
    </ul>
  );
}
