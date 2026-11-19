"use client";

import { FitName } from "./FitName";
import { useState } from "react";
import type { LeaderRow } from "./GolfLeaderboard";
import { GolfScorecard } from "./GolfScorecard";

/**
 * A golfer's name that opens their hole-by-hole scorecard (the Leaderboard's pop-up), for
 * lineups shown outside the Leaderboard. Without a tournament to read, just the name.
 */
export function ScorecardLink({
  golfer,
  tournamentId,
  eventName,
  live,
  className = "",
  fit = false,
}: {
  golfer: LeaderRow;
  tournamentId: string | null;
  eventName: string;
  live: boolean;
  className?: string;
  /** One line that fits its box: shrinks, then first initial and last name (FitName). */
  fit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!tournamentId) return fit ? <FitName name={golfer.name} className={className} /> : <span className={className}>{golfer.name}</span>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-left -mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 transition hover:bg-hover ${fit ? "block w-[calc(100%+0.75rem)]" : ""} ${className}`}
        title={`${golfer.name}: scorecard`}
      >
        {fit ? <FitName name={golfer.name} /> : golfer.name}
      </button>
      {open && <GolfScorecard tournamentId={tournamentId} eventName={eventName} golfer={golfer} live={live} onClose={() => setOpen(false)} />}
    </>
  );
}
