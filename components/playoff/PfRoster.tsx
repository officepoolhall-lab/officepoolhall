"use client";

import { useState } from "react";
import { FitText } from "@/components/FitText";
import { TeamLogo } from "@/components/ui";
import { Shell } from "@/components/ProfileDialogs";

// The locked My Team lineup: one row per player with his pool ownership, points round by round
// and in all. A row opens his playoff games only: each round's opponent, score, line and points.

const ROUNDS = [
  { name: "Wild Card", short: "WC" },
  { name: "Divisional", short: "DIV" },
  { name: "Conference", short: "CONF" },
  { name: "Super Bowl", short: "SB" },
];

/** One round of a player's playoffs: his team's game (null: none that round) and what he did in it. */
export type PfLogRound = {
  game: { oppAbbr: string | null; oppLogo: string | null; home: boolean; us: number; them: number; state: "pre" | "in" | "post" } | null;
  stats: string | null;
  points: number | null;
};
export type PfRosterRow = {
  id: string;
  name: string;
  pos: string;
  team: string | null;
  logo: string | null;
  out: boolean;
  /** Share of the pool's lineups with him, 0-100; null before anyone's lineup counts. */
  own: number | null;
  total: number;
  rounds: PfLogRound[];
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
// Pos | Player | Own | rounds (from sm) | Total
const GRID = "grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem_3.5rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_3.25rem_repeat(4,3.75rem)_4.25rem] items-center gap-x-2";

export function PfRosterTable({ rows, roundTotals, started }: { rows: PfRosterRow[]; roundTotals: number[]; started: number }) {
  const [open, setOpen] = useState<PfRosterRow | null>(null);
  const cell = (r: PfLogRound, i: number) => (i >= started || !r.game ? "–" : fmt(r.points ?? 0));
  return (
    <div className="text-sm">
      <div className={`${GRID} border-b border-line py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted`}>
        <span className="text-center">Pos</span>
        <span>Player</span>
        <span className="text-right">Own</span>
        {ROUNDS.map((r) => (
          <span key={r.short} className="hidden text-right sm:block">{r.short}</span>
        ))}
        <span className="text-right">Total</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpen(p)}
              className={`${GRID} w-full cursor-pointer py-2 text-left hover:bg-surface ${p.out ? "opacity-55" : ""}`}
              aria-label={`${p.name}: playoff games`}
            >
              <span className="text-center text-[11px] font-bold text-muted">{p.pos}</span>
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamLogo src={p.logo} abbr={p.team} className="size-5 shrink-0" />
                  <FitText min={10} className={`min-w-0 flex-1 font-semibold ${p.out ? "line-through" : ""}`}>{p.name}</FitText>
                </span>
                {/* Below sm the round columns don't fit: the rounds go on a line under the name. */}
                {started > 0 && (
                  <FitText min={8} className="pl-7 text-[11px] tabular-nums text-muted sm:hidden">
                    {ROUNDS.slice(0, started).map((r, i) => `${r.short} ${cell(p.rounds[i], i)}`).join(" · ")}
                  </FitText>
                )}
              </span>
              <span className="text-right text-xs tabular-nums text-muted">{p.own === null ? "–" : `${p.own}%`}</span>
              {p.rounds.map((r, i) => (
                <span key={i} className={`hidden text-right tabular-nums sm:block ${i >= started || !r.game ? "text-muted" : ""}`}>{cell(r, i)}</span>
              ))}
              <span className="text-right font-bold tabular-nums">{fmt(p.total)}</span>
            </button>
          </li>
        ))}
      </ul>
      {started > 0 && (
        <div className={`${GRID} hidden border-t-2 border-line py-2 font-bold sm:grid`}>
          <span />
          <span>Lineup total</span>
          <span />
          {roundTotals.map((v, i) => (
            <span key={i} className={`text-right tabular-nums ${i >= started ? "text-muted" : ""}`}>{i >= started ? "–" : fmt(v)}</span>
          ))}
          <span className="text-right tabular-nums">{fmt(roundTotals.reduce((a, b) => a + b, 0))}</span>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Own is the share of the pool&apos;s lineups with that player. Tap a player for his playoff games.</p>
      {open && <PlayoffLog row={open} started={started} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** A player's playoff games only, round by round. */
function PlayoffLog({ row, started, onClose }: { row: PfRosterRow; started: number; onClose: () => void }) {
  const [shot, setShot] = useState(row.pos !== "DEF");
  const games = row.rounds
    .map((r, i) => ({ ...r, i }))
    .filter((r) => r.i < started)
    // A team with no Wild Card game had the bye; past that, no game means it was knocked out.
    .filter((r) => r.game || r.i === 0);
  return (
    <Shell
      label={`${row.name}: playoff games`}
      onClose={onClose}
      size="wide"
      header={
        <div className="flex items-center gap-3">
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element -- ESPN's headshot, any size
            <img src={`https://a.espncdn.com/i/headshots/nfl/players/full/${row.id}.png`} alt="" onError={() => setShot(false)} className="size-14 shrink-0 rounded-full bg-surface object-cover" />
          ) : (
            <TeamLogo src={row.logo} abbr={row.team} className="size-12 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              {shot && <TeamLogo src={row.logo} abbr={null} className="size-6" />}
              <h2 className="min-w-0 flex-1 text-lg font-bold"><FitText min={12}>{row.name}</FitText></h2>
            </div>
            <FitText min={9} className="text-xs text-muted">
              {[row.team, row.pos, row.own === null ? null : `${row.own}% rostered`, row.out ? "Eliminated" : null].filter(Boolean).join(" · ")}
            </FitText>
          </div>
        </div>
      }
    >
      {games.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No playoff games yet.</p>
      ) : (
        <div className="mt-4 text-sm">
          <div className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] gap-x-3 border-b border-line pb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted sm:grid-cols-[6.5rem_9.5rem_minmax(0,1fr)_3.5rem]">
            <span>Round</span>
            <span className="hidden sm:block">Game</span>
            <span>Stats</span>
            <span className="text-right">Pts</span>
          </div>
          <ul className="divide-y divide-line">
            {games.map((r) => {
              const g = r.game;
              const result = g ? `${g.state === "post" ? (g.us > g.them ? "W " : g.us < g.them ? "L " : "T ") : g.state === "in" ? "Live " : ""}${g.us}-${g.them}` : null;
              const vs = g ? (
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="text-muted">{g.home ? "vs" : "@"}</span>
                  <TeamLogo src={g.oppLogo} abbr={g.oppAbbr} className="size-4 shrink-0" />
                  <span className="font-semibold">{g.oppAbbr}</span>
                  <span className={`tabular-nums ${g.state === "post" && g.us > g.them ? "text-emerald-600 dark:text-emerald-400" : g.state === "post" ? "text-red-600 dark:text-red-400" : "text-muted"}`}>{result}</span>
                </span>
              ) : null;
              return (
                <li key={r.i} className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] items-center gap-x-3 py-2 sm:grid-cols-[6.5rem_9.5rem_minmax(0,1fr)_3.5rem]">
                  <span className="font-semibold">
                    <span className="sm:hidden">{ROUNDS[r.i].short}</span>
                    <span className="hidden sm:inline">{ROUNDS[r.i].name}</span>
                  </span>
                  <span className="hidden whitespace-nowrap sm:block">{vs ?? <span className="text-muted">Bye</span>}</span>
                  <span className="flex min-w-0 flex-col">
                    {/* Below sm the game sits above the line. */}
                    <span className="whitespace-nowrap text-xs sm:hidden">{vs ?? <span className="text-muted">Bye</span>}</span>
                    {g ? <FitText min={9} className="text-xs tabular-nums text-muted sm:text-sm sm:text-ink">{r.stats ?? "Didn't play"}</FitText> : <span className="text-xs text-muted sm:hidden">No game</span>}
                  </span>
                  <span className="text-right font-bold tabular-nums">{g ? fmt(r.points ?? 0) : "–"}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between border-t-2 border-line pt-2 font-bold">
            <span>Playoff total</span>
            <span className="tabular-nums">{fmt(row.total)}</span>
          </div>
        </div>
      )}
    </Shell>
  );
}
