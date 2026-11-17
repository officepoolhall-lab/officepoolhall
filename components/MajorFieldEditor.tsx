"use client";

import { useMemo, useState, useTransition } from "react";
import type { ActionState } from "./ActionForm";
import { inputClass } from "./ui";

export type EditorGolfer = { espn_golfer_id: string; golfer_name: string; world_rank: number | null; odds: number | null; tier: number | null; salary: number | null };

const odds = (n: number | null) => (n === null ? "–" : n > 0 ? `+${n.toLocaleString("en-US")}` : n.toLocaleString("en-US"));
const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * The admin's view of a major's field: every golfer with world rank and DraftKings odds, and
 * their tier (Tiers pools) or salary (Salary Cap pools), all editable; one Save for the lot.
 * Locked once the major has started.
 */
export function MajorFieldEditor({
  golfers,
  contest,
  tierCount,
  picks,
  budget,
  roster,
  locked,
  save,
}: {
  golfers: EditorGolfer[];
  contest: "tiers" | "salary";
  tierCount: number;
  picks: number[];
  budget: number;
  roster: number;
  locked: boolean;
  save: (edits: { espn_golfer_id: string; tier: number | null; salary: number | null }[]) => Promise<ActionState>;
}) {
  const [rows, setRows] = useState(golfers);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  const dirty = rows.some((r, i) => r.tier !== golfers[i].tier || r.salary !== golfers[i].salary);

  const set = (id: string, patch: Partial<EditorGolfer>) => setRows((rs) => rs.map((r) => (r.espn_golfer_id === id ? { ...r, ...patch } : r)));
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.golfer_name.toLowerCase().includes(q)) : rows;
    return contest === "salary"
      ? [...list].sort((a, b) => (b.salary ?? -1) - (a.salary ?? -1) || a.golfer_name.localeCompare(b.golfer_name))
      : [...list].sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99) || (a.world_rank ?? 9999) - (b.world_rank ?? 9999) || a.golfer_name.localeCompare(b.golfer_name));
  }, [rows, query, contest]);

  const perTier = Array.from({ length: tierCount }, (_, i) => rows.filter((r) => r.tier === i + 1).length);
  const short = perTier.map((n, i) => (n < picks[i] ? i + 1 : null)).filter(Boolean);
  const cheapest = [...rows].map((r) => r.salary ?? Infinity).sort((a, b) => a - b).slice(0, roster);
  const cheapestTotal = cheapest.every(Number.isFinite) ? cheapest.reduce((a, b) => a + b, 0) : null;
  const field = `${inputClass} !min-h-9 !py-1 tabular-nums`;

  return (
    <div>
      {/* Summary: tier sizes (and any tier too small to pick from) or the salary range. */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {contest === "tiers" ? (
          <span className="tabular-nums text-muted">
            {perTier.map((n, i) => (
              <span key={i} className="mr-3 whitespace-nowrap">
                Tier {i + 1}: <span className="font-semibold text-ink">{n}</span>
                <span className="text-xs"> (pick {picks[i]})</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="tabular-nums text-muted">
            Budget <span className="font-semibold text-ink">{dollars(budget)}</span> for {roster} · cheapest {roster}:{" "}
            <span className="font-semibold text-ink">{cheapestTotal === null ? "–" : dollars(cheapestTotal)}</span>
          </span>
        )}
        {short.length > 0 && <span className="font-semibold text-loss">Not enough golfers in Tier {short.join(", ")}</span>}
        {contest === "salary" && cheapestTotal !== null && cheapestTotal > budget && <span className="font-semibold text-loss">No roster fits the budget</span>}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a golfer" className={`${inputClass} !min-h-9 max-w-xs`} />
        {!locked && (
          <button
            type="button"
            disabled={!dirty || pending}
            onClick={() => start(async () => setState(await save(rows.map(({ espn_golfer_id, tier, salary }) => ({ espn_golfer_id, tier, salary })))))}
            className="ml-auto inline-flex min-h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-bg disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>
      {state.error && <p className="mb-2 text-sm font-semibold text-loss">{state.error}</p>}
      {state.ok && !dirty && <p className="mb-2 text-sm font-semibold text-win">{state.ok}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-1.5 font-medium">Golfer</th>
            <th className="w-16 py-1.5 text-right font-medium">Rank</th>
            <th className="w-20 py-1.5 text-right font-medium">Odds</th>
            <th className="w-32 py-1.5 pl-3 font-medium">{contest === "salary" ? "Salary" : "Tier"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((r) => (
            <tr key={r.espn_golfer_id}>
              <td className="py-1 font-medium">{r.golfer_name}</td>
              <td className="py-1 text-right tabular-nums text-muted">{r.world_rank ?? "–"}</td>
              <td className="py-1 text-right tabular-nums text-muted">{odds(r.odds)}</td>
              <td className="py-1 pl-3">
                {contest === "salary" ? (
                  <input
                    type="number"
                    min={0}
                    step={100}
                    disabled={locked}
                    value={r.salary ?? ""}
                    onChange={(e) => set(r.espn_golfer_id, { salary: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })}
                    aria-label={`${r.golfer_name} salary`}
                    className={field}
                  />
                ) : (
                  <select
                    disabled={locked}
                    value={r.tier ?? ""}
                    onChange={(e) => set(r.espn_golfer_id, { tier: e.target.value === "" ? null : Number(e.target.value) })}
                    aria-label={`${r.golfer_name} tier`}
                    className={field}
                  >
                    <option value="">Not in a tier</option>
                    {Array.from({ length: tierCount }, (_, i) => (
                      <option key={i} value={i + 1}>
                        Tier {i + 1}
                      </option>
                    ))}
                  </select>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
