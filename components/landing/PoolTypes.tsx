"use client";

import Link from "next/link";
import { useState } from "react";
import { SportIcon } from "@/components/SportIcon";
import type { PoolKind } from "@/lib/poolType";

// The landing page's pool types: pick a sport or league first, then see the pools it offers.

type PoolType = { name: string; text: string; soon?: boolean };
type League = { id: string; label: string; full: string; kind: PoolKind; types: PoolType[] };

const LEAGUES: League[] = [
  {
    id: "nfl",
    label: "NFL",
    full: "NFL",
    kind: "football",
    types: [
      { name: "Supercontest", text: "Pick a set number of games against the spread each week. Lines lock when the week is published." },
      { name: "Survivor", text: "Pick one team to win each week. Lose and you're out, and you can't use a team twice.", soon: true },
      { name: "Pick'em", text: "Pick the winner of every game straight up, no spreads. Easy for anyone to jump into." },
      { name: "Confidence", text: "Pick every game and rank them. Your surest pick is worth the most points." },
      { name: "Super Bowl Squares", text: "A 10-by-10 grid for the big game. Numbers are drawn at random, and each quarter's score picks a winner.", soon: true },
      { name: "Playoff Fantasy", text: "Pick a roster of players for the playoffs and ride them all postseason. Points for every yard and touchdown.", soon: true },
      { name: "Guillotine", text: "A fantasy league where the lowest-scoring team each week is cut, and its players go back up for grabs.", soon: true },
    ],
  },
  {
    id: "ncaaf",
    label: "NCAAF",
    full: "College football",
    kind: "football",
    types: [
      { name: "Supercontest", text: "Pick a set number of games against the spread from each week's slate." },
      { name: "Pick'em", text: "Pick winners straight up from the week's biggest games." },
      { name: "Confidence", text: "Pick every game on the slate and rank them by how sure you are." },
    ],
  },
  {
    id: "ncaab",
    label: "NCAAB",
    full: "College basketball",
    kind: "basketball",
    types: [
      { name: "Confidence", text: "Weekly slates all season, ranked by confidence, with bonus points for calling early-season tournament champions." },
      { name: "Pick'em", text: "Pick the winner of every game straight up, no spreads. Easy for anyone to jump into." },
      { name: "Pick X", text: "Pick a set number of tournament teams. Every game they win earns you points, with more for lower seeds.", soon: true },
      { name: "Bracket", text: "Fill out the whole tournament bracket before it tips off. Each round is worth more than the last.", soon: true },
    ],
  },
  {
    id: "pga",
    label: "PGA",
    full: "PGA Tour",
    kind: "golf",
    types: [
      { name: "Tiers", text: "Golfers split into tiers by odds and world ranking. Pick from each tier for a major or any tour event." },
      { name: "Salary Cap", text: "Build a roster of golfers under a budget, scored hole by hole, fantasy style." },
      { name: "One-and-Done", text: "One golfer a week, each golfer only once all season. Standings are the prize money your golfers win." },
    ],
  },
];

export function PoolTypes({ startHref }: { startHref: string }) {
  const [active, setActive] = useState(LEAGUES[0].id);
  const league = LEAGUES.find((l) => l.id === active) ?? LEAGUES[0];

  return (
    <div>
      {/* Step 1: the sport or league. */}
      <div role="tablist" aria-label="Sport" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LEAGUES.map((l) => {
          const on = l.id === active;
          return (
            <button
              key={l.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(l.id)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition ${
                on ? "bg-accent text-white ring-1 ring-accent dark:text-black" : "bg-bg text-ink ring-1 ring-line hover:bg-hover"
              }`}
            >
              <SportIcon kind={l.kind} className={`size-6 shrink-0 ${on ? "" : "text-accent"}`} />
              <span className="min-w-0">
                <span className="block text-lg font-extrabold leading-tight tracking-[-0.02em]">{l.label}</span>
                <span className={`block truncate text-xs ${on ? "opacity-85" : "text-muted"}`}>
                  {l.types.length} {l.types.length === 1 ? "pool type" : "pool types"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Step 2: that league's pools. */}
      <div role="tabpanel" aria-label={`${league.full} pools`} className="mt-6">
        <div className="mb-3 text-sm font-semibold text-muted">{league.full} pools</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {league.types.map((t) =>
            t.soon ? (
              <div key={t.name} className="flex flex-col rounded-2xl bg-bg p-5 ring-1 ring-line">
                {/* The label sits above the name so long names stay on one line. */}
                <span className="mb-2 self-start rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">Coming soon</span>
                <h3 className="whitespace-nowrap text-lg font-bold leading-tight">{t.name}</h3>
                <p className="mt-2 flex-1 text-sm text-muted">{t.text}</p>
              </div>
            ) : (
              <Link key={t.name} href={startHref} className="group flex flex-col rounded-2xl bg-bg p-5 ring-1 ring-line transition hover:ring-2 hover:ring-accent">
                <h3 className="whitespace-nowrap text-lg font-bold leading-tight">{t.name}</h3>
                <p className="mt-2 flex-1 text-sm text-muted">{t.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
                  Start this pool
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
