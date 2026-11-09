import type { CSSProperties } from "react";
import { formatInTimeZone } from "date-fns-tz";
import type { GolfTickerMode } from "@/lib/golf";
import { formatToPar } from "@/lib/golfLive";

export type TickerGolfer = {
  id: string;
  name: string;
  pos: string;
  toPar: string | null;
  thru: string | null;
  tee: string | null;
  earnings: number;
  lastName: string;
  order: number | null;
};

const short$ = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, "")}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : n > 0 ? `$${n}` : "";

/**
 * The scroll across the top of the golf home page. Monday and Tuesday: last week's finish
 * (place, score, prize money). From Wednesday: the coming event's tee times. During the event:
 * the live leaderboard (place, score, holes played). The viewer's own pick is outlined.
 * Uses the same sliding track as the football and basketball ticker (globals.css).
 */
export function GolfTicker({
  mode,
  eventName,
  golfers,
  myGolferId,
  timezone,
}: {
  mode: GolfTickerMode;
  eventName: string;
  golfers: TickerGolfer[];
  myGolferId: string | null;
  timezone: string;
}) {
  if (!golfers.length) return null;
  const label = mode === "live" ? "Live" : mode === "results" ? "Final" : golfers.some((g) => g.tee) ? "Tee times" : "Field";
  const moving = golfers.length >= 3;

  const chips = (copy: boolean) => (
    <ul className={`flex shrink-0 gap-2 ${moving ? "pr-2" : ""} ${copy ? "ticker-copy" : ""}`} aria-hidden={copy || undefined}>
      {golfers.map((g) => (
        <li key={g.id}>
          <span
            className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-2.5 text-xs ${
              g.id === myGolferId ? "ring-2 ring-accent" : ""
            }`}
          >
            {mode !== "tees" && g.pos !== "-" && <span className="font-semibold tabular-nums text-muted">{g.pos}</span>}
            {mode === "tees" && g.tee && <span className="tabular-nums text-muted">{formatInTimeZone(g.tee, timezone, "EEE h:mm a")}</span>}
            <span className="font-medium text-ink">{g.name}</span>
            {mode !== "tees" && g.toPar && (
              // Golf's convention: under par in red.
              <span className={`font-semibold tabular-nums ${g.toPar.startsWith("-") ? "text-loss" : "text-ink"}`}>{formatToPar(g.toPar)}</span>
            )}
            {mode === "live" && g.thru && <span className="tabular-nums text-muted">{g.thru === "F" ? "F" : `Thru ${g.thru}`}</span>}
            {mode === "results" && g.earnings > 0 && <span className="tabular-nums text-muted">{short$(g.earnings)}</span>}
            {g.id === myGolferId && <span className="sr-only"> (your pick)</span>}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex min-w-0 items-center gap-2" aria-label={`${eventName}: ${label.toLowerCase()}`}>
      <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-ink px-2.5 text-xs font-semibold text-surface">
        {mode === "live" && <span className="size-1.5 animate-pulse rounded-full bg-live" />}
        <span className="max-w-[10rem] truncate">{eventName}</span>
        <span className="font-normal opacity-80">· {label}</span>
      </span>
      <div className={`ticker min-w-0 flex-1 overflow-hidden ${moving ? "[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]" : ""}`}>
        {/* About 3 seconds per golfer. */}
        <div
          className={`flex w-max ${moving ? "ticker-track" : ""}`}
          style={moving ? ({ "--ticker-duration": `${Math.max(20, golfers.length * 3)}s` } as CSSProperties) : undefined}
        >
          {chips(false)}
          {moving && chips(true)}
        </div>
      </div>
    </div>
  );
}
