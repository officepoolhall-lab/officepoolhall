"use client";

import { useState } from "react";
import { FitText } from "@/components/FitText";
import { TeamLogo } from "@/components/ui";
import { ROUNDS } from "@/lib/bracket";
import type { TeamGame } from "@/lib/tourneyLive";
import { TeamGames } from "./TeamGames";

// One entry's Pick X teams as a table, like Playoff Fantasy's lineup: seed, team, how much of the
// pool has it, the points from each round's win (a red L in the round it lost), and in all.
// Phones: a simpler row (logo, seed and team, its rounds on a line under it, points and ownership
// on the right). With games, a team's row opens to show its tournament games.

export type PickXTeamRow = {
  teamId: string;
  seed: number;
  name: string;
  abbr: string | null;
  logo: string | null;
  region: string;
  /** Share of the pool's entries with this team, 0-100; null before the lock. */
  own: number | null;
  /** Points from each round's win (null: no win that round). */
  points: (number | null)[];
  /** The round it lost in (1-6), or 0 while it's alive. */
  lostIn: number;
  total: number;
};

const FULL = "grid grid-cols-[2rem_minmax(0,1fr)_3rem_3.25rem] sm:grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_repeat(6,3rem)_3.75rem] items-center gap-x-2";
const COMPACT = "grid grid-cols-[2rem_minmax(0,1fr)_3rem_3.25rem] sm:grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_repeat(6,2.5rem)_3.25rem] items-center gap-x-1.5";

const FULL_OPEN = "grid grid-cols-[2rem_minmax(0,1fr)_3rem_3.25rem_1rem] sm:grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_repeat(6,3rem)_3.75rem_1rem] items-center gap-x-2";
const COMPACT_OPEN = "grid grid-cols-[2rem_minmax(0,1fr)_3rem_3.25rem_1rem] sm:grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_repeat(6,2.5rem)_3.25rem_1rem] items-center gap-x-1.5";

/** The open/close arrow on a row that opens. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={`size-4 justify-self-end text-muted transition-transform ${open ? "rotate-180" : ""}`}>
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
    </svg>
  );
}

export function PickXTeamsTable({ rows, started, compact = false, totalRow = true, games }: { rows: PickXTeamRow[]; /** Rounds with results in (0-6). */ started: number; compact?: boolean; totalRow?: boolean; /** Each team's games: rows open to show them. */ games?: Record<string, TeamGame[]> }) {
  // With games, a last column for the open/close arrow.
  const grid = games ? (compact ? COMPACT_OPEN : FULL_OPEN) : compact ? COMPACT : FULL;
  const [open, setOpen] = useState<string | null>(null);
  const cell = (t: PickXTeamRow, i: number) =>
    t.points[i] !== null ? { text: String(t.points[i]), cls: "" } : t.lostIn === i + 1 ? { text: "L", cls: "font-bold text-loss" } : { text: "–", cls: "text-muted" };
  const sums = ROUNDS.map((_, i) => rows.reduce((s, t) => s + (t.points[i] ?? 0), 0));
  // Desktop's table rows (phones get their own layout).
  const desk = grid.replace(/^grid /, "hidden sm:grid ");
  return (
    <div className={compact ? "text-sm sm:text-[13px]" : "text-sm"}>
      <div className={`${desk} border-b border-line py-1.5 ${compact ? "text-[10px]" : "text-[11px]"} font-bold tracking-wide text-muted uppercase`}>
        <span className="text-center">Seed</span>
        <span>Team</span>
        <span className="text-right">Own %</span>
        {ROUNDS.map((r) => (
          <span key={r.round} className="hidden text-right sm:block">{r.short}</span>
        ))}
        <span className="text-right">Total</span>
        {games && <span />}
      </div>
      <ul className="divide-y divide-line">
        {rows.map((t) => {
          const Row = games ? "button" : "div";
          return (
          <li key={t.teamId}>
          <Row
            {...(games ? { type: "button" as const, onClick: () => setOpen(open === t.teamId ? null : t.teamId), "aria-expanded": open === t.teamId } : {})}
            className={`block w-full text-left ${t.lostIn ? "text-muted" : ""} ${games ? "cursor-pointer hover:bg-hover" : ""}`}
          >
            {/* Phones */}
            <span className="flex items-center gap-3 py-2.5 sm:hidden">
              <TeamLogo src={t.logo} abbr={t.abbr} className={`size-8 shrink-0 ${t.lostIn ? "opacity-50" : ""}`} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 text-xs font-bold tabular-nums text-muted">{t.seed}</span>
                  <FitText min={11} className={`min-w-0 flex-1 text-[15px] font-semibold ${t.lostIn ? "line-through decoration-1" : "text-ink"}`}>{t.name}</FitText>
                </span>
                <FitText min={9} className="text-xs tabular-nums text-muted">
                  {started > 0
                    ? ROUNDS.slice(0, t.lostIn ? Math.min(t.lostIn, started) : started).map((r, i) => (
                        <span key={r.round}>
                          {i > 0 && <span className="px-1 text-faint">·</span>}
                          {r.short} <span className={cell(t, i).cls || "text-ink"}>{cell(t, i).text}</span>
                        </span>
                      ))
                    : t.region}
                </FitText>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className={`text-lg leading-none font-bold tabular-nums ${t.lostIn ? "" : "text-ink"}`}>{t.total}</span>
                <span className="text-[11px] leading-none tabular-nums text-muted">{t.own === null ? "" : `${t.own}% own`}</span>
              </span>
              {games && <Chevron open={open === t.teamId} />}
            </span>
            {/* Desktop */}
            <span className={`${desk} ${compact ? "py-1.5" : "py-2"}`}>
            <span className="text-center text-xs font-bold tabular-nums text-muted">{t.seed}</span>
            <span className="flex min-w-0 items-center gap-2">
              <TeamLogo src={t.logo} abbr={t.abbr} className={`${compact ? "size-4" : "size-5"} shrink-0`} />
              <FitText min={10} className={`min-w-0 flex-1 font-semibold ${t.lostIn ? "line-through decoration-1" : "text-ink"}`}>{t.name}</FitText>
            </span>
            <span className="text-right text-xs tabular-nums text-muted">{t.own === null ? "–" : `${t.own}%`}</span>
            {ROUNDS.map((_, i) => {
              const c = i < started ? cell(t, i) : { text: "–", cls: "text-muted" };
              return (
                <span key={i} className={`hidden text-right tabular-nums sm:block ${c.cls}`}>{c.text}</span>
              );
            })}
            <span className={`text-right font-bold tabular-nums ${t.lostIn ? "" : "text-ink"}`}>{t.total}</span>
            {games && <Chevron open={open === t.teamId} />}
            </span>
          </Row>
          {games && open === t.teamId && (
            <div className={`mb-2.5 rounded-lg bg-surface px-3 sm:mb-2 sm:ml-10 ${compact ? "sm:ml-8" : ""}`}>
              <TeamGames games={games[t.teamId]} />
            </div>
          )}
          </li>
          );
        })}
      </ul>
      {totalRow && started > 0 && (
        <div className={`${grid} hidden border-t-2 border-line py-2 font-bold sm:grid`}>
          <span />
          <span>Total</span>
          <span />
          {sums.map((v, i) => (
            <span key={i} className={`text-right tabular-nums ${i >= started ? "text-muted" : ""}`}>{i >= started ? "–" : v}</span>
          ))}
          <span className="text-right tabular-nums">{sums.reduce((a, b) => a + b, 0)}</span>
          {games && <span />}
        </div>
      )}
    </div>
  );
}
