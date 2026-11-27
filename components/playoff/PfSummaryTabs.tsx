"use client";

import { useState, type ReactNode } from "react";
import { FitText } from "@/components/FitText";
import { TeamLogo, chipClass } from "@/components/ui";

// The Pool Summary page's two tabs: Ownership (every rostered player, filtered by position and
// sorted by any column) and Top Players (each position's most rostered and highest scoring).

export type SumPlayer = {
  id: string;
  name: string;
  pos: string;
  team: string | null;
  logo: string | null;
  out: boolean;
  /** Lineups with him, and that as a share of the pool's lineups (0-100, one decimal). */
  count: number;
  own: number;
  /** Playoff fantasy points so far. */
  points: number;
};
/** One position on Top Players: its most rostered and its highest scorers (value already formatted). */
export type SumGroup = {
  pos: string;
  name: string;
  rostered: { p: SumPlayer; value: string }[];
  scoring: { p: SumPlayer; value: string; sub?: string | null }[];
};

type Tab = "own" | "top" | "perfect";
type Sort = "name" | "own" | "count" | "points";

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export type SumNotes = {
  /** Instead of the ownership table before it shows. */
  own: string;
  /** Instead of the perfect lineup before (or when) there isn't one. */
  perfect: string;
  /** What Own counts, when it isn't the lineups ("entries that have used him"). */
  ownOf: string | null;
};

export function PfSummaryTabs({ owned, groups, positions, lineups, locked, started, perfect, notes }: {
  owned: SumPlayer[];
  groups: SumGroup[];
  positions: string[];
  /** Lineups set in the pool. */
  lineups: number;
  locked: boolean;
  /** A playoff game has started: "highest scoring" is playoff points, not the regular season. */
  started: boolean;
  /** The perfect lineup (null until the Wild Card round starts), its own tab. */
  perfect: ReactNode;
  /** Weekly style: the wording for a round (or all rounds). */
  notes?: SumNotes;
}) {
  const [tab, setTab] = useState<Tab>(locked ? "own" : "top");
  return (
    <>
      <div className="mb-4 inline-flex rounded-full bg-surface p-0.5" role="tablist">
        {([["own", "Ownership %"], ["top", "Top Players"], ["perfect", "Perfect Lineup"]] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex h-8 cursor-pointer items-center justify-center rounded-full px-3 text-[13px] sm:px-4 sm:text-sm font-medium whitespace-nowrap transition ${tab === id ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "own" ? (
        locked ? (
          <Ownership owned={owned} positions={positions} lineups={lineups} ownOf={notes?.ownOf ?? null} />
        ) : (
          <p className="text-sm text-muted">{notes?.own ?? "Ownership shows once lineups lock."}</p>
        )
      ) : tab === "top" ? (
        <TopPlayers groups={groups} locked={locked} started={started} />
      ) : (
        perfect ?? <p className="text-sm text-muted">{notes?.perfect ?? "The perfect lineup shows once the Wild Card round starts."}</p>
      )}
    </>
  );
}

/** Every rostered player: a position filter, and a sort on any column (tap again to flip it). */
function Ownership({ owned, positions, lineups, ownOf }: { owned: SumPlayer[]; positions: string[]; lineups: number; ownOf: string | null }) {
  const [pos, setPos] = useState<string>("ALL");
  const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: "own", desc: true });
  const list = owned
    .filter((p) => pos === "ALL" || p.pos === pos)
    .sort((a, b) => {
      const d = sort.by === "name" ? a.name.localeCompare(b.name) : sort.by === "own" ? a.count - b.count : sort.by === "count" ? a.count - b.count : a.points - b.points;
      return (sort.desc ? -d : d) || b.count - a.count || b.points - a.points || a.name.localeCompare(b.name);
    });
  const head = (by: Sort, label: string, className: string) => (
    <button
      type="button"
      onClick={() => setSort((s) => (s.by === by ? { by, desc: !s.desc } : { by, desc: by !== "name" }))}
      className={`flex cursor-pointer items-center gap-0.5 font-bold uppercase tracking-wide hover:text-ink ${sort.by === by ? "text-ink" : ""} ${className}`}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <span aria-hidden className={`text-[9px] ${sort.by === by ? "" : "invisible"}`}>{sort.desc ? "▼" : "▲"}</span>
    </button>
  );
  const grid = "grid grid-cols-[2rem_minmax(0,1fr)_3.75rem_3.75rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem] items-center gap-x-2";
  return (
    <section className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-1.5">
        {["ALL", ...positions].map((p) => (
          <button key={p} type="button" onClick={() => setPos(p)} className={chipClass(pos === p, "cursor-pointer", "sm")}>
            {p === "ALL" ? "All" : p}
          </button>
        ))}
      </div>
      <div className={`${grid} mt-3 border-b border-line pb-1.5 text-[11px] text-muted`}>
        <span className="text-center font-bold">POS</span>
        {head("name", "Player", "")}
        {head("own", "Own", "justify-end")}
        {head("count", "Lineups", "hidden justify-end sm:flex")}
        {head("points", "Pts", "justify-end")}
      </div>
      {list.length === 0 ? (
        <p className="py-3 text-sm text-muted">Nobody at this position is in a lineup.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className={`${grid} py-1.5 text-sm ${p.out ? "text-muted" : ""}`}>
              <span className="text-center text-[11px] font-bold text-muted">{p.pos}</span>
              <span className="flex min-w-0 items-center gap-2">
                <TeamLogo src={p.logo} abbr={p.team} className="size-5 shrink-0" />
                <FitText min={10} className={`min-w-0 flex-1 font-medium ${p.out ? "line-through decoration-1" : ""}`}>{p.name}</FitText>
              </span>
              <span className="text-right font-semibold tabular-nums">{p.own.toFixed(1)}%</span>
              <span className="hidden text-right tabular-nums text-muted sm:block">{p.count}</span>
              <span className="text-right tabular-nums">{fmt(p.points)}</span>
            </li>
          ))}
        </ul>
      )}
      <FitText min={8} className="mt-2 text-xs text-muted">{ownOf ? `Own is the share of the pool's ${lineups} entries that have used that player. Tap a column to sort.` : `Own is the share of the pool's ${lineups} lineups with that player. Tap a column to sort.`}</FitText>
    </section>
  );
}

/** Each position: its most rostered and its highest scoring, side by side. */
function TopPlayers({ groups, locked, started }: { groups: SumGroup[]; locked: boolean; started: boolean }) {
  const row = (p: SumPlayer, value: string, sub?: string | null) => (
    <li key={p.id} className={`flex h-8 items-center gap-1.5 text-[13px] ${p.out ? "text-muted" : ""}`}>
      <TeamLogo src={p.logo} abbr={p.team} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <FitText min={10} className={`block font-medium ${p.out ? "line-through decoration-1" : ""}`}>{p.name}</FitText>
        {sub && <FitText min={8} className="block text-[10px] leading-tight text-muted tabular-nums">{sub}</FitText>}
      </span>
      <span className="shrink-0 pl-1 font-semibold tabular-nums">{value}</span>
    </li>
  );
  return (
    <div className="grid items-start gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <section key={g.pos} className="min-w-0">
            <div className="border-b-2 border-line pb-1 text-sm font-bold">{g.name}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-4">
              <div className="min-w-0">
                <div className="py-1 text-[11px] font-bold tracking-wide text-muted uppercase">Most rostered</div>
                {locked ? (
                  <ul className="divide-y divide-line">{g.rostered.map((r) => row(r.p, r.value))}</ul>
                ) : (
                  <p className="text-xs text-muted">After the lock</p>
                )}
              </div>
              <div className="min-w-0">
                <div className="py-1 text-[11px] font-bold tracking-wide text-muted uppercase">{started ? "Highest scoring" : "Top reg. season"}</div>
                {g.scoring.length ? (
                  <ul className="divide-y divide-line">{g.scoring.map((r) => row(r.p, r.value, r.sub))}</ul>
                ) : (
                  <p className="text-xs text-muted">No points yet</p>
                )}
              </div>
            </div>
          </section>
        ))}
    </div>
  );
}
