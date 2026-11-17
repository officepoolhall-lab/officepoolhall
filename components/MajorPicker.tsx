"use client";

import { useMemo, useState, useTransition } from "react";
import type { ActionState } from "./ActionForm";
import { CheckIcon, chipClass, inputClass } from "./ui";

export type PickerFieldGolfer = { espn_golfer_id: string; golfer_name: string; world_rank: number | null; odds: number | null; tier: number | null; salary: number | null };

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
  const [tier, setTier] = useState(1);
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

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let l = golfers.filter((g) => (contest === "tiers" ? g.tier === tier : g.salary !== null));
    if (q) l = l.filter((g) => g.golfer_name.toLowerCase().includes(q));
    const rank = (g: PickerFieldGolfer) => g.world_rank ?? 9999;
    const odds = (g: PickerFieldGolfer) => (g.odds === null ? Infinity : g.odds);
    return [...l].sort((a, b) =>
      contest === "salary" && sort === "salary"
        ? b.salary! - a.salary! || rank(a) - rank(b)
        : sort === "odds"
          ? odds(a) - odds(b) || rank(a) - rank(b)
          : rank(a) - rank(b) || a.golfer_name.localeCompare(b.golfer_name),
    );
  }, [golfers, contest, tier, query, sort]);

  const lineup = chosen.map((id) => byId.get(id)).filter((g): g is PickerFieldGolfer => !!g);
  const complete = contest === "tiers" ? picks.every((n, i) => inTier(i + 1) === n) : chosen.length === roster && left >= 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The lineup so far. */}
      <div className="mb-3 shrink-0 rounded-lg bg-surface p-3">
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

      {contest === "tiers" && (
        <div className="mb-2 flex shrink-0 flex-wrap gap-1.5" role="group" aria-label="Tier">
          {picks.map((n, i) => {
            const done = inTier(i + 1) === n;
            return (
              <button key={i} type="button" onClick={() => setTier(i + 1)} aria-pressed={tier === i + 1} className={chipClass(tier === i + 1, "", "sm")}>
                {done && <CheckIcon className="mr-1 size-3" />}
                Tier {i + 1}
                <span className="ml-1 font-normal opacity-70">
                  {inTier(i + 1)}/{n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a golfer" className={`${inputClass} h-9 min-w-0 flex-1 basis-40`} />
        <div className="flex gap-1 text-xs" role="group" aria-label="Sort">
          {(contest === "salary" ? (["salary", "rank", "odds"] as const) : (["rank", "odds"] as const)).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)} aria-pressed={sort === k} className={`h-8 rounded-full px-2.5 font-medium ${sort === k ? "bg-ink text-bg" : "text-muted hover:bg-surface"}`}>
              {k === "salary" ? "Salary" : k === "rank" ? "World Rank" : "Odds"}
            </button>
          ))}
        </div>
      </div>
      {contest === "tiers" && <p className="mb-1.5 shrink-0 text-xs text-muted">Tier {tier}: pick {picks[tier - 1]}</p>}

      <ul className="min-h-[10rem] flex-1 divide-y divide-line overflow-y-auto overscroll-contain rounded-lg border border-line" aria-label="Field">
        {list.map((g) => {
          const on = chosen.includes(g.espn_golfer_id);
          const tooMuch = contest === "salary" && !on && (chosen.length >= roster || (g.salary ?? 0) > left);
          return (
            <li key={g.espn_golfer_id}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => toggle(g)}
                aria-pressed={on}
                className={`flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${on ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : "enabled:hover:bg-surface"} ${tooMuch ? "opacity-45" : ""}`}
              >
                <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-accent bg-accent text-bg" : "border-faint"}`}>
                  {on && <CheckIcon className="size-3" />}
                </span>
                <span className={`min-w-0 flex-1 truncate font-medium ${on ? "text-accent" : ""}`}>{g.golfer_name}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{g.world_rank ? `#${g.world_rank}` : ""}</span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">{oddsLabel(g.odds)}</span>
                {contest === "salary" && <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{dollars(g.salary!)}</span>}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-3 text-sm text-muted">No golfers match.</li>}
      </ul>

      {!readOnly && (
        <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <p className={`text-sm ${state.error ? "font-semibold text-loss" : state.ok ? "font-semibold text-win" : "text-muted"}`}>
            {state.error ?? state.ok ?? (complete ? (saved ? "Lineup saved." : "Ready to save.") : contest === "salary" && left < 0 ? "Over the budget." : `${need - chosen.length > 0 ? need - chosen.length : 0} to go.`)}
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
