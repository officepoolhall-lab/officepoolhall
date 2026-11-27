import Link from "next/link";
import type { StandingRow } from "@/lib/golfStandings";
import { LockIcon, Medal } from "./ui";

// The golf Standings columns, laid out like the football and basketball ones
// (SeasonStandings): place, entry, the numbers right-aligned. Names wrap rather than being
// cut off.

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const head = "text-[11px] font-medium text-muted";

function Player({ r, href }: { r: { userId: string; name: string; isMe: boolean }; href: (userId: string) => string }) {
  return (
    <>
      <Link href={href(r.userId)} className={`-mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 transition hover:bg-hover ${r.isMe ? "text-accent" : ""}`}>
        {r.name}
      </Link>
    </>
  );
}

function Place({ place, tied, medal = false }: { place: number | null; tied: boolean; /** Final standings: a medal for 1st-3rd. */ medal?: boolean }) {
  if (medal && place !== null && place <= 3)
    return (
      <span className="flex w-7 shrink-0 justify-end" title={tied ? `Tied for ${place}` : undefined}>
        <Medal place={place} className="size-6" />
      </span>
    );
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
export function GolfSeasonStandings({ rows, playerHref, medals = false }: { rows: StandingRow[]; playerHref: (userId: string) => string; /** The season is final: medals for the top three. */ medals?: boolean }) {
  return (
    <ul className="divide-y divide-line border-b border-line">
      {rows.map((r) => (
        <li key={r.userId} className="flex min-h-9 items-center gap-3 py-1.5 text-sm">
          <Place place={r.place} tied={r.tied} medal={medals} />
          <span className="min-w-0 flex-1 break-words font-medium leading-snug">
            <Player r={r} href={playerHref} />
            {r.missed > 0 && <span className="ml-1.5 whitespace-nowrap text-xs font-normal text-muted">{r.missed} Missed</span>}
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

/** Entry · Golfer · Earnings (or Current Position), matching GolfWeekStandings' columns, on one line. */
export function GolfWeekHeaderRow({ final, live = false }: { final: boolean; live?: boolean }) {
  return (
    <div className="flex items-end gap-3 border-b border-line pb-1.5 pt-2" aria-hidden>
      {/* Places only once the week is final; until then Entry starts at the left edge. */}
      {final && <span className="w-7 shrink-0" />}
      <span className={`min-w-0 flex-1 ${head}`}>Entry</span>
      <span className={`min-w-0 flex-1 ${head}`}>Golfer</span>
      <span className={`w-[5.5rem] shrink-0 text-right leading-tight sm:w-28 ${head}`}>{final ? (
          "Earnings"
        ) : (
          <>
            {live && <span className="mr-1 font-semibold text-live">Live</span>}
            Current Position
          </>
        )}
      </span>
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
  /** Share of the week's picks on this golfer (0-100); null when it isn't known yet. */
  own: number | null;
};

function Golfer({ r, final }: { r: WeekRow; final: boolean }) {
  if (r.hidden)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-faint">
        <LockIcon className="size-3" /> Hidden Until the Lock
      </span>
    );
  if (!r.golfer) return <span className="text-xs text-muted">No Pick</span>;
  return (
    <>
      {r.golfer}
      {final && r.finish && <span className="ml-1.5 whitespace-nowrap text-xs tabular-nums text-muted">{r.finish}</span>}
      {r.own !== null && (
        <span className="ml-1.5 whitespace-nowrap text-xs tabular-nums text-muted" title={`${r.own}% of the pool picked ${r.golfer}`}>
          · {r.own}% own
        </span>
      )}
    </>
  );
}

/** One event: everyone's golfer, where they finished and what they earned, best first. */
export function GolfWeekStandings({ rows, final, playerHref }: { rows: WeekRow[]; final: boolean; playerHref: (userId: string) => string }) {
  return (
    <ul className="divide-y divide-line border-b border-line">
      {rows.map((r) => (
        <li key={r.userId} className="flex min-h-9 items-center gap-3 py-1.5 text-sm">
          {final && <Place place={r.place} tied={r.tied} />}
          <span className="min-w-0 flex-1 break-words font-medium leading-snug">
            <Player r={r} href={playerHref} />
          </span>
          <span className="min-w-0 flex-1 break-words leading-snug">
            <Golfer r={r} final={final} />
          </span>
          <span className={`w-[5.5rem] shrink-0 text-right tabular-nums sm:w-28 ${final ? (r.earned > 0 ? "text-[15px] font-semibold" : "text-muted") : "text-xs text-muted"}`}>
            {final ? money(r.earned) : r.finish}
          </span>
        </li>
      ))}
    </ul>
  );
}
