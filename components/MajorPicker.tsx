"use client";

import { useMemo, useState, useTransition } from "react";
import type { ActionState } from "./ActionForm";
import { CheckIcon, inputClass } from "./ui";

export type PickerFieldGolfer = { espn_golfer_id: string; golfer_name: string; world_rank: number | null; odds: number | null; tier: number | null; salary: number | null };

const SORTS: ("salary" | "rank" | "odds")[] = ["salary", "rank", "odds"];
const dollars = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
const oddsLabel = (n: number | null) => (n === null ? "" : n > 0 ? `+${n.toLocaleString("en-US")}` : n.toLocaleString("en-US"));

/**
 * Picking a lineup for a major. Tiers: a section per tier (pick N from each), golfers by world
 * rank with their odds. Salary Cap: the field by salary with the budget left and the average
 * left per open spot; golfers that would break the budget are dimmed. One Save for the lineup;
 * the database checks the rules again.
 */
export function MajorPicker({
  contest,
  golfers,
  picks,
  budget,
  roster,
  initial,
  readOnly,
  save,
}: {
  contest: "tiers" | "salary";
  golfers: PickerFieldGolfer[];
  picks: number[];
  budget: number;
  roster: number;
  initial: string[];
  readOnly: boolean;
  save: (ids: string[]) => Promise<ActionState>;
}) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"salary" | "rank" | "odds">(contest === "salary" ? "salary" : "rank");
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  const byId = useMemo(() => new Map(golfers.map((g) => [g.espn_golfer_id, g])), [golfers]);
  const need = contest === "salary" ? roster : picks.reduce((a, b) => a + b, 0);
  const saved = initial.length === chosen.length && initial.every((id) => chosen.includes(id));
  const spent = chosen.reduce((t, id) => t + (byId.get(id)?.salary ?? 0), 0);
  const left = budget - spent;
  const inTier = (t: number) => chosen.filter((id) => byId.get(id)?.tier === t).length;

  const toggle = (g: PickerFieldGolfer) => {
    if (readOnly) return;
    setState({});
    setChosen((c) => {
      if (c.includes(g.espn_golfer_id)) return c.filter((id) => id !== g.espn_golfer_id);
      if (contest === "tiers") {
        const t = g.tier!;
        const mine = c.filter((id) => byId.get(id)?.tier === t);
        // A full tier swaps out its earliest pick (one-pick tiers just switch golfers).
        const next = mine.length >= picks[t - 1] ? c.filter((id) => id !== mine[0]) : c;
        return [...next, g.espn_golfer_id];
      }
      if (c.length >= roster) return c;
      return [...c, g.espn_golfer_id];
    });
  };

  // Search, then sort: salary (salary cap), world rank or odds.
  const sorted = (l: PickerFieldGolfer[]) => {
    const q = query.trim().toLowerCase();
    const rank = (g: PickerFieldGolfer) => g.world_rank ?? 9999;
    const odds = (g: PickerFieldGolfer) => (g.odds === null ? Infinity : g.odds);
    return (q ? l.filter((g) => g.golfer_name.toLowerCase().includes(q)) : l).sort((a, b) =>
      contest === "salary" && sort === "salary"
        ? b.salary! - a.salary! || rank(a) - rank(b)
        : sort === "odds"
          ? odds(a) - odds(b) || rank(a) - rank(b)
          : rank(a) - rank(b) || a.golfer_name.localeCompare(b.golfer_name),
    );
  };

  const row = (g: PickerFieldGolfer) => {
    const on = chosen.includes(g.espn_golfer_id);
    const tooMuch = contest === "salary" && !on && (chosen.length >= roster || (g.salary ?? 0) > left);
    return (
      <li key={g.espn_golfer_id}>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => toggle(g)}
          aria-pressed={on}
          className={`flex min-h-10 w-full items-center gap-2 px-1.5 py-1 text-left text-sm ${on ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : "enabled:hover:bg-surface"} ${tooMuch ? "opacity-45" : ""}`}
        >
          <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-accent bg-accent text-bg" : "border-faint"}`}>
            {on && <CheckIcon className="size-3" />}
          </span>
          <span className={`min-w-0 flex-1 truncate font-medium ${on ? "text-accent" : ""}`}>{g.golfer_name}</span>
          <span className="shrink-0 text-right text-xs tabular-nums text-muted">{g.world_rank ? `#${g.world_rank}` : ""}</span>
          {g.odds !== null && <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">{oddsLabel(g.odds)}</span>}
          {contest === "salary" && <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{dollars(g.salary!)}</span>}
        </button>
      </li>
    );
  };

  const lineup = chosen.map((id) => byId.get(id)).filter((g): g is PickerFieldGolfer => !!g);
  const complete = contest === "tiers" ? picks.every((n, i) => inTier(i + 1) === n) : chosen.length === roster && left >= 0;

  return (
    <div>
      {/* The lineup so far. */}
      <div className="mb-3 rounded-lg bg-surface p-3">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">
            My Lineup · {chosen.length} of {need}
          </span>
          {contest === "salary" && (
            <span className="tabular-nums">
              Left <span className={`font-semibold ${left < 0 ? "text-loss" : "text-ink"}`}>{dollars(left)}</span>
              {chosen.length < roster && left > 0 && <> · {dollars(Math.floor(left / (roster - chosen.length)))} per golfer</>}
            </span>
          )}
        </div>
        {lineup.length === 0 ? (
          <p className="text-sm text-muted">{readOnly ? "No lineup." : contest === "tiers" ? "Pick from each tier below." : "Add golfers below."}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {lineup.map((g) => (
              <li key={g.espn_golfer_id}>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggle(g)}
                  className="inline-flex h-7 items-center gap-1 rounded-full bg-bg px-2.5 text-xs font-medium ring-1 ring-line enabled:hover:ring-accent"
                  title={readOnly ? undefined : `Remove ${g.golfer_name}`}
                >
                  {contest === "tiers" ? <span className="tabular-nums text-muted">T{g.tier}</span> : <span className="tabular-nums text-muted">{dollars(g.salary!)}</span>}
                  {g.golfer_name}
                  {!readOnly && <span aria-hidden className="text-muted">×</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a golfer" className={`${inputClass} h-9 min-w-0 max-w-sm flex-1 basis-40`} />
        <div className="flex gap-1 text-xs" role="group" aria-label="Sort">
          {(contest === "salary" ? SORTS : SORTS.slice(1)).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k} className={`h-8 rounded-full px-2.5 font-medium ${sort === k ? "bg-ink text-bg" : "text-muted hover:bg-surface"}`}>
              {k === "salary" ? "Salary" : k === "rank" ? "World Rank" : "Odds"}
            </button>
          ))}
        </div>
      </div>

      {contest === "tiers" ? (
        // Every tier at once, side by side as the screen allows; the page scrolls, no inner boxes.
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
          {picks.map((n, i) => {
            const t = i + 1;
            const rows = sorted(golfers.filter((g) => g.tier === t));
            const done = inTier(t) === n;
            return (
              <section key={t} aria-label={`Tier ${t}`} className="min-w-0">
                <h3 className="flex items-center justify-between gap-2 border-b-2 border-ink/25 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span className="flex items-center gap-1">
                    {done && <CheckIcon className="size-3 text-win" />}Tier {t}
                  </span>
                  <span className="font-normal normal-case tracking-normal tabular-nums">
                    Pick {n} · {inTier(t)}/{n}
                  </span>
                </h3>
                <ul className="divide-y divide-line">
                  {rows.map((g) => row(g))}
                  {rows.length === 0 && <li className="py-2 text-sm text-muted">{query ? "No golfers match." : "No golfers."}</li>}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        // The whole field in columns across the screen.
        <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3 [&>li]:border-b [&>li]:border-line">
          {sorted(golfers.filter((g) => g.salary !== null)).map((g) => row(g))}
        </ul>
      )}

      {!readOnly && (
        // Pinned to the bottom of the screen while picking, so Save is always in reach.
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:mx-0 sm:px-0">
          <p className={`text-sm ${state?.error ? "font-semibold text-loss" : state?.ok ? "font-semibold text-win" : "text-muted"}`}>
            {state?.error ?? state?.ok ?? (complete ? (saved ? "Lineup saved." : "Ready to save.") : contest === "salary" && left < 0 ? "Over the budget." : `${need - chosen.length > 0 ? need - chosen.length : 0} to go.`)}
          </p>
          <button
            type="button"
            disabled={!complete || saved || pending}
            onClick={() => start(async () => setState(await save(chosen)))}
            className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-40"
          >
            {pending ? "Saving…" : initial.length ? "Save Changes" : "Save Lineup"}
          </button>
        </div>
      )}
    </div>
  );
}
