import Link from "next/link";
import type { StandingRow } from "@/lib/golfStandings";
import { LockIcon } from "./ui";

// The golf Standings columns, laid out like the football and basketball ones
// (SeasonStandings): place, player, the numbers right-aligned. Names wrap rather than being
// cut off, and on phones a week's golfer sits under the player's name.

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const head = "text-[11px] font-medium text-muted";

function Player({ r, href }: { r: { userId: string; name: string; isMe: boolean }; href: (userId: string) => string }) {
  return (
    <>
      <Link href={href(r.userId)} className={`hover:underline ${r.isMe ? "text-accent" : ""}`}>
        {r.name}
      </Link>
    </>
  );
}

function Place({ place, tied }: { place: number | null; tied: boolean }) {
  return <span className="w-7 shrink-0 text-right text-sm tabular-nums text-muted">{place === null ? "" : `${tied ? "T" : ""}${place}`}</span>;
}

/** Entry · Cuts · Earnings, matching GolfSeasonStandings' columns. */
export function GolfSeasonHeaderRow() {
  return (
    <div className="flex items-end gap-3 border-b border-line pb-1.5 pt-2" aria-hidden>
      <span className="w-7 shrink-0" />
      <span className={`min-w-0 flex-1 ${head}`}>Entry</span>
      <span className={`w-10 shrink-0 text-right ${head}`}>Cuts</span>
      <span className={`w-[6.5rem] shrink-0 text-right ${head}`}>Earnings</span>
    </div>
  );
}

/** The season: everyone by prize money, with cuts made. */
export function GolfSeasonStandings({ rows, playerHref }: { rows: StandingRow[]; playerHref: (userId: string) => string }) {
  return (
    <ul className="divide-y divide-line border-b border-line">
      {rows.map((r) => (
        <li key={r.userId} className="flex min-h-9 items-center gap-3 py-1.5 text-sm">
          <Place place={r.place} tied={r.tied} />
          <span className="min-w-0 flex-1 break-words font-medium leading-snug">
            <Player r={r} href={playerHref} />
            {r.missed > 0 && <span className="ml-1.5 whitespace-nowrap text-xs font-normal text-muted">{r.missed} missed</span>}
          </span>
          <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted">
            {r.cuts}/{r.picks}
            <span className="sr-only"> cuts made</span>
          </span>
          <span className="w-[6.5rem] shrink-0 text-right text-[15px] font-semibold tabular-nums">{money(r.total)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Entry · Golfer · Earnings, matching GolfWeekStandings' columns (Golfer folds under Player on phones). */
export function GolfWeekHeaderRow({ final }: { final: boolean }) {
  return (
    <div className="flex items-end gap-3 border-b border-line pb-1.5 pt-2" aria-hidden>
      <span className="w-7 shrink-0" />
      <span className={`min-w-0 flex-1 ${head}`}>
        Entry<span className="sm:hidden"> · Golfer</span>
      </span>
      <span className={`hidden min-w-0 flex-1 sm:block ${head}`}>Golfer</span>
      <span className={`w-24 shrink-0 text-right ${head}`}>{final ? "Earnings" : "Now"}</span>
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

function Golfer({ r, final }: { r: WeekRow; final: boolean }) {
  if (r.hidden)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-faint">
        <LockIcon className="size-3" /> Hidden until the lock
      </span>
    );
  if (!r.golfer) return <span className="text-xs text-muted">No pick</span>;
  return (
    <>
      {r.golfer}
      {final && r.finish && <span className="ml-1.5 whitespace-nowrap text-xs tabular-nums text-muted">{r.finish}</span>}
    </>
  );
}

/** One event: everyone's golfer, where they finished and what they earned, best first. */
export function GolfWeekStandings({ rows, final, playerHref }: { rows: WeekRow[]; final: boolean; playerHref: (userId: string) => string }) {
  return (
    <ul className="divide-y divide-line border-b border-line">
      {rows.map((r) => (
        <li key={r.userId} className="flex min-h-9 items-center gap-3 py-1.5 text-sm">
          <Place place={r.place} tied={r.tied} />
          <span className="min-w-0 flex-1 break-words leading-snug">
            <span className="font-medium">
              <Player r={r} href={playerHref} />
            </span>
            {/* Phones: the golfer on a second line under the player. */}
            <span className="block text-[13px] text-muted sm:hidden">
              <Golfer r={r} final={final} />
            </span>
          </span>
          <span className="hidden min-w-0 flex-1 break-words leading-snug sm:block">
            <Golfer r={r} final={final} />
          </span>
          <span className={`w-24 shrink-0 text-right tabular-nums ${final ? (r.earned > 0 ? "text-[15px] font-semibold" : "text-muted") : "text-xs text-muted"}`}>
            {final ? money(r.earned) : r.finish}
          </span>
        </li>
      ))}
    </ul>
  );
}
