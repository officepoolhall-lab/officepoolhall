"use client";

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
}: {
  golfer: LeaderRow;
  tournamentId: string | null;
  eventName: string;
  live: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!tournamentId) return <span className={className}>{golfer.name}</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`text-left hover:underline ${className}`} title={`${golfer.name}: scorecard`}>
        {golfer.name}
      </button>
      {open && <GolfScorecard tournamentId={tournamentId} eventName={eventName} golfer={golfer} live={live} onClose={() => setOpen(false)} />}
    </>
  );
}
