"use client";

import { FitText } from "@/components/FitText";
import { ROUNDS } from "@/lib/bracket";
import type { TeamGame } from "@/lib/tourneyLive";

// A team's tournament games, shown when its row is opened: each round's result and score, the
// game being played, or the next one's opponent and tip time.

export function TeamGames({ games }: { games: TeamGame[] | undefined }) {
  if (!games?.length) return <p className="py-1.5 text-xs text-muted">No games yet.</p>;
  return (
    <ul className="divide-y divide-line py-0.5 text-[13px] sm:text-xs">
      {games.map((g) => {
        const result = g.won ? "W" : g.lost ? "L" : g.status === "in_progress" ? "Live" : null;
        return (
          <li key={g.round} className="flex h-8 items-center gap-2 whitespace-nowrap sm:h-7">
            <span className="w-9 shrink-0 text-[11px] font-bold tracking-wide text-muted uppercase">{ROUNDS[g.round - 1]?.short}</span>
            <span className={`w-8 shrink-0 font-bold ${g.won ? "text-win" : g.lost ? "text-loss" : g.status === "in_progress" ? "text-accent" : "text-muted"}`}>{result ?? "–"}</span>
            {g.score !== null && g.oppScore !== null && <span className="w-12 shrink-0 font-semibold tabular-nums">{g.score}–{g.oppScore}</span>}
            <FitText min={9} className="min-w-0 flex-1">
              vs {g.opp ? <>{g.opp.seed !== null && <span className="text-muted tabular-nums">{g.opp.seed} </span>}{g.opp.name}</> : <span className="text-muted">TBD</span>}
            </FitText>
            {g.detail && !g.won && !g.lost && <span className="shrink-0 text-muted">{g.detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}
