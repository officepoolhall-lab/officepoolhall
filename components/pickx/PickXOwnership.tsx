"use client";

import { useState } from "react";
import { FitText } from "@/components/FitText";
import { TeamLogo, chipClass } from "@/components/ui";

// Pick X Home, once picks lock: every team in the field with how much of the pool picked it and
// what it has scored. Filter by region, sort by any column (tap again to flip it).

export type PickXOwnRow = {
  teamId: string;
  seed: number;
  name: string;
  abbr: string | null;
  logo: string | null;
  region: string;
  /** Entries with the team, and that as a share of the entries with picks (0-100, one decimal). */
  count: number;
  own: number;
  points: number;
  wins: number;
  alive: boolean;
};

type Sort = "seed" | "name" | "own" | "wins" | "points";

export function PickXOwnership({ rows, regions, entries }: { rows: PickXOwnRow[]; regions: string[]; entries: number }) {
  const [region, setRegion] = useState("ALL");
  const [picked, setPicked] = useState(true);
  const [sort, setSort] = useState<{ by: Sort; desc: boolean }>({ by: "own", desc: true });
  const list = rows
    .filter((r) => (region === "ALL" || r.region === region) && (!picked || r.count > 0))
    .sort((a, b) => {
      const d = sort.by === "name" ? a.name.localeCompare(b.name) : sort.by === "seed" ? a.seed - b.seed : sort.by === "own" ? a.count - b.count : sort.by === "wins" ? a.wins - b.wins : a.points - b.points;
      return (sort.desc ? -d : d) || b.count - a.count || a.seed - b.seed || a.name.localeCompare(b.name);
    });
  const head = (by: Sort, label: string, className = "") => (
    <button
      type="button"
      onClick={() => setSort((s) => (s.by === by ? { by, desc: !s.desc } : { by, desc: by !== "name" && by !== "seed" }))}
      className={`flex cursor-pointer items-center gap-0.5 font-bold uppercase tracking-wide hover:text-ink ${sort.by === by ? "text-ink" : ""} ${className}`}
      aria-label={`Sort by ${label}`}
    >
      {label}
      <span aria-hidden className={`text-[9px] ${sort.by === by ? "" : "invisible"}`}>{sort.desc ? "▼" : "▲"}</span>
    </button>
  );
  const grid = "grid grid-cols-[2.25rem_minmax(0,1fr)_3.75rem_2.25rem_3rem] sm:grid-cols-[2.75rem_minmax(0,1fr)_5.5rem_4.5rem_4.5rem_3rem_4rem] items-center gap-x-2";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {["ALL", ...regions].map((r) => (
          <button key={r} type="button" onClick={() => setRegion(r)} className={chipClass(region === r, "cursor-pointer", "sm")}>
            {r === "ALL" ? "All" : r}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-sm text-muted">
          <input type="checkbox" checked={picked} onChange={(e) => setPicked(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Picked only
        </label>
      </div>
      <div className={`${grid} mt-3 border-b border-line pb-1.5 text-[11px] text-muted`}>
        {head("seed", "Seed", "justify-center")}
        {head("name", "Team")}
        <span className="hidden font-bold tracking-wide uppercase sm:block">Region</span>
        {head("own", "Own %", "justify-end")}
        <span className="hidden text-right font-bold tracking-wide uppercase sm:block">Entries</span>
        {head("wins", "W", "justify-end")}
        {head("points", "Pts", "justify-end")}
      </div>
      {list.length === 0 ? (
        <p className="py-3 text-sm text-muted">No teams here were picked.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((r) => (
            <li key={r.teamId} className={`${grid} py-1.5 text-sm ${r.alive ? "" : "text-muted"}`}>
              <span className="text-center text-xs font-bold tabular-nums text-muted">{r.seed}</span>
              <span className="flex min-w-0 items-center gap-2">
                <TeamLogo src={r.logo} abbr={r.abbr} className="size-5 shrink-0" />
                <FitText min={10} className={`min-w-0 flex-1 font-medium ${r.alive ? "" : "line-through decoration-1"}`}>{r.name}</FitText>
              </span>
              <span className="hidden truncate text-xs text-muted sm:block">{r.region}</span>
              <span className="text-right font-semibold tabular-nums">{r.own.toFixed(1)}%</span>
              <span className="hidden text-right tabular-nums text-muted sm:block">{r.count}</span>
              <span className="text-right tabular-nums text-muted">{r.wins}</span>
              <span className="text-right tabular-nums">{r.points}</span>
            </li>
          ))}
        </ul>
      )}
      <FitText min={8} className="mt-2 text-xs text-muted">Own % is the share of the pool&apos;s {entries} entries with that team. W is its wins and Pts what it has scored for each entry with it. Tap a column to sort.</FitText>
    </div>
  );
}
