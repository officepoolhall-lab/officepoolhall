"use client";

import { useState, type ReactNode } from "react";
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
  /** His numbers in the row's stat columns (null: no line that round). */
  stats: (number | string)[] | null;
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
  /** The game log's stat columns for his position. */
  statHead: { group: string; label: string }[];
  rounds: PfLogRound[];
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
// Pos | Player | Own | rounds (from sm) | Total
const GRID_FULL = "grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem_3.5rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_3.25rem_repeat(4,3.75rem)_4.25rem] items-center gap-x-2";
// The Standings cards: the same columns, tighter, so three entries fit across a laptop.
const GRID_COMPACT = "grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem_3.5rem] sm:grid-cols-[1.75rem_minmax(0,1fr)_2.25rem_repeat(4,2.75rem)_3.25rem] items-center gap-x-1.5";

export function PfRosterTable({ rows, roundTotals, started, compact = false }: { rows: PfRosterRow[]; roundTotals: number[]; started: number; /** Standings: tighter columns, smaller type, no note under it. */ compact?: boolean }) {
  const [open, setOpen] = useState<PfRosterRow | null>(null);
  const GRID = compact ? GRID_COMPACT : GRID_FULL;
  const cell = (r: PfLogRound, i: number) => (i >= started || !r.game ? "–" : fmt(r.points ?? 0));
  return (
    <div className={compact ? "text-sm sm:text-[13px]" : "text-sm"}>
      <div className={`${GRID} border-b border-line py-1.5 ${compact ? "text-[10px]" : "text-[11px]"} font-bold uppercase tracking-wide text-muted`}>
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
              className={`${GRID} w-full cursor-pointer ${compact ? "py-1.5" : "py-2"} text-left hover:bg-surface ${p.out ? "opacity-55" : ""}`}
              aria-label={`${p.name}: playoff games`}
            >
              <span className="text-center text-[11px] font-bold text-muted">{p.pos}</span>
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamLogo src={p.logo} abbr={p.team} className={`${compact ? "size-4" : "size-5"} shrink-0`} />
                  <FitText min={10} className={`min-w-0 flex-1 font-semibold ${p.out ? "line-through" : ""}`}>{p.name}</FitText>
                </span>
                {/* Below sm the round columns don't fit: the rounds go on a line under the name. */}
                {started > 0 && (
                  <FitText min={8} className={`${compact ? "pl-6" : "pl-7"} text-[11px] tabular-nums text-muted sm:hidden`}>
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
      {!compact && <FitText min={8} className="mt-2 text-xs text-muted">Tap a player to view game stats. Own % is the share of the pool&apos;s lineups with that player.</FitText>}
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
        <GameLog row={row} games={games} />
      )}
    </Shell>
  );
}

type LogGame = PfLogRound & { i: number };

/** The stat columns' group headings ("Passing" over YDS TD INT), one cell per run of a group. */
function groupRuns(head: { group: string }[]) {
  const runs: { group: string; span: number; start: number }[] = [];
  head.forEach((h, j) => {
    const last = runs[runs.length - 1];
    if (last && last.group === h.group) last.span++;
    else runs.push({ group: h.group, span: 1, start: j });
  });
  return runs;
}

/** Opponent and result: "vs [logo] JAX  W 31-17". */
function Matchup({ g }: { g: NonNullable<PfLogRound["game"]> }) {
  const won = g.us > g.them;
  const result = g.state === "post" ? `${won ? "W" : g.us < g.them ? "L" : "T"} ${g.us}-${g.them}` : g.state === "in" ? `Live ${g.us}-${g.them}` : "";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="w-4 text-xs text-muted">{g.home ? "vs" : "@"}</span>
      <TeamLogo src={g.oppLogo} abbr={g.oppAbbr} className="size-4 shrink-0" />
      <span className="w-9 font-semibold">{g.oppAbbr}</span>
      <span className={`text-xs font-semibold tabular-nums ${g.state === "post" ? (won ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400") : "text-muted"}`}>{result}</span>
    </span>
  );
}

const TH = "px-1.5 text-[10px] font-bold uppercase tracking-wide text-muted";
const TD = "px-1.5 text-right tabular-nums";

/**
 * The playoff game log as a table, ESPN style: stat groups over their columns, one row a game,
 * points on the right. Below sm each game (round, opponent, result) gets its own line above its
 * numbers so the stat columns keep their room.
 */
function GameLog({ row, games }: { row: PfRosterRow; games: LogGame[] }) {
  const head = row.statHead;
  const runs = groupRuns(head);
  // Each group's first column gets a divider on its left.
  const starts = new Set(runs.slice(1).map((r) => r.start));
  const sep = (j: number) => (starts.has(j) ? "border-l border-line" : "");
  const stat = (r: LogGame, j: number) => (r.stats ? r.stats[j] : 0);
  const totals = head.map((h, j) =>
    h.label === "LONG" ? Math.max(0, ...games.map((r) => Number(r.stats?.[j]) || 0)) || "–" : games.reduce((t, r) => t + (Number(r.stats?.[j]) || 0), 0),
  );
  const groupRow = (lead: number) => (
    <tr>
      {lead > 0 && <th colSpan={lead} />}
      {runs.map((r, k) => (
        <th key={k} colSpan={r.span} className={`${TH} border-b border-line pb-1 text-center ${k > 0 ? "border-l" : ""}`}>{r.group}</th>
      ))}
      <th />
    </tr>
  );
  const labels = (lead: ReactNode) => (
    <tr className="border-b border-line">
      {lead}
      {head.map((h, j) => <th key={j} className={`${TH} py-1 text-right ${sep(j)}`}>{h.label}</th>)}
      <th className={`${TH} py-1 pr-0 text-right`}>PTS</th>
    </tr>
  );
  const totalCells = (
    <>
      {totals.map((v, j) => <td key={j} className={`${TD} py-2 ${sep(j)}`}>{v}</td>)}
      <td className={`${TD} py-2 pr-0`}>{fmt(row.total)}</td>
    </>
  );
  return (
    <div className="mt-4">
      {/* sm and up: Round | Game | stats | Pts on one row. */}
      <table className="hidden w-full text-sm sm:table">
        <thead>
          {groupRow(2)}
          {labels(<><th className={`${TH} py-1 pl-0 text-left`}>Round</th><th className={`${TH} py-1 text-left`}>Game</th></>)}
        </thead>
        <tbody className="divide-y divide-line">
          {games.map((r) => (
            <tr key={r.i}>
              <td className="whitespace-nowrap py-2 pr-1.5 font-semibold">{ROUNDS[r.i].name}</td>
              <td className="px-1.5 py-2">{r.game ? <Matchup g={r.game} /> : <span className="text-muted">Bye</span>}</td>
              {head.map((_, j) => <td key={j} className={`${TD} py-2 ${sep(j)}`}>{r.game ? stat(r, j) : ""}</td>)}
              <td className={`${TD} py-2 pr-0 font-bold`}>{r.game ? fmt(r.points ?? 0) : "–"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-line font-bold">
          <tr>
            <td className="py-2" colSpan={2}>Playoff total</td>
            {totalCells}
          </tr>
        </tfoot>
      </table>

      {/* Phones: the playoff totals as three tiles, then each game with its numbers in a small
          row of grouped columns (the same columns every game, so they line up). */}
      <div className="sm:hidden">
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {tiles(row, totals).map((t) => (
            <div key={t.label} className="rounded-lg bg-surface px-1 py-1.5">
              <div className="text-lg font-bold tabular-nums">{t.value}</div>
              <div className="text-[11px] text-muted">{t.label}</div>
            </div>
          ))}
        </div>
        <ul className="mt-2">
          {games.map((r) => (
            <li key={r.i} className="border-t border-line py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-9 shrink-0 text-xs font-bold">{ROUNDS[r.i].short}</span>
                  {r.game ? <Matchup g={r.game} /> : <span className="text-xs text-muted">Bye</span>}
                </span>
                <span className="shrink-0 font-bold tabular-nums">{r.game ? fmt(r.points ?? 0) : "–"}</span>
              </div>
              {r.game && (
                <div className="mt-1.5 grid text-center tabular-nums" style={{ gridTemplateColumns: `repeat(${head.length}, minmax(0, 1fr))` }}>
                  {runs.map((g, k) => (
                    <span key={`g${k}`} className={`truncate border-b border-line pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted ${k > 0 ? "border-l" : ""}`} style={{ gridColumn: `span ${g.span}` }}>
                      {g.group}
                    </span>
                  ))}
                  {head.map((h, j) => (
                    <span key={j} className={`pt-1 ${sep(j)}`}>
                      <span className="block text-[15px] font-semibold leading-tight">{stat(r, j)}</span>
                      <span className="block text-[10px] text-muted">{h.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The three playoff totals for the top of the phone pop-up, by position. */
function tiles(row: PfRosterRow, totals: (number | string)[]): { label: string; value: string }[] {
  const col = (group: string, label: string) => {
    const j = row.statHead.findIndex((h) => h.group === group && h.label === label);
    return j < 0 ? 0 : totals[j];
  };
  const sum = (...v: (number | string)[]) => v.reduce<number>((t, x) => t + (Number(x) || 0), 0);
  const tds = sum(...row.statHead.map((h, j) => (h.label === "TD" ? totals[j] : 0)));
  const points = { label: "Points", value: fmt(row.total) };
  const pick: Record<string, { label: string; value: number | string }[]> = {
    QB: [{ label: "Pass yds", value: col("Passing", "YDS") }, { label: "Total TD", value: tds }],
    RB: [{ label: "Rush yds", value: col("Rushing", "YDS") }, { label: "Total TD", value: tds }],
    WR: [{ label: "Catches", value: col("Receiving", "REC") }, { label: "Rec yds", value: col("Receiving", "YDS") }],
    TE: [{ label: "Catches", value: col("Receiving", "REC") }, { label: "Rec yds", value: col("Receiving", "YDS") }],
    K: [{ label: "Field goals", value: col("Kicking", "FG") }, { label: "Long", value: col("Kicking", "LONG") }],
    DEF: [{ label: "Sacks", value: col("Defense", "SACK") }, { label: "Takeaways", value: sum(col("Defense", "INT"), col("Defense", "FR")) }],
  };
  return [points, ...(pick[row.pos] ?? []).map((t) => ({ label: t.label, value: String(t.value) }))];
}
