"use client";

import { useMemo, useState, useTransition } from "react";
import type { FieldHistory } from "@/lib/golfFieldHistory";
import type { ActionState } from "./ActionForm";
import { GolferHistoryDialog, type SeasonHistory } from "./GolferHistoryDialog";
import { CheckIcon, chipClass, inputClass } from "./ui";

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
  history,
  season,
  save,
  oddsNote = null,
}: {
  /** What the Odds column shows (blended or odds to win), under the search and sort. */
  oddsNote?: string | null;
  contest: "tiers" | "salary";
  golfers: PickerFieldGolfer[];
  picks: number[];
  budget: number;
  roster: number;
  initial: string[];
  readOnly: boolean;
  /** Past results at this major and this season, for the whole field, loading with the page. */
  history: Promise<FieldHistory>;
  /** This season's PGA Tour events for the field, loading separately. */
  season: Promise<SeasonHistory>;
  save: (ids: string[]) => Promise<ActionState>;
}) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"salary" | "rank" | "odds">(contest === "salary" ? "salary" : "rank");
  const [state, setState] = useState<ActionState>({});
  const [historyFor, setHistoryFor] = useState<PickerFieldGolfer | null>(null);
  // Phones and tablets show one tier at a time.
  const [tier, setTier] = useState(1);
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

  const hasOdds = golfers.some((g) => g.odds !== null);
  // Column titles over a list of golfers, lined up with the rows below (same widths and gaps;
  // an invisible History button holds its place).
  const header = (extra = "") => (
    <li aria-hidden className={`flex items-center gap-1.5 pr-1 text-[10px] font-semibold uppercase tracking-wide text-muted ${extra}`}>
      <span className="flex min-w-0 flex-1 items-center gap-2 px-1.5 pb-0.5 pt-1.5">
        <span className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">Golfer</span>
        <span className="w-10 shrink-0 text-center">WGR</span>
        {hasOdds && <span className="w-16 shrink-0 text-center">Odds</span>}
        {contest === "salary" && <span className="w-16 shrink-0 text-right">Salary</span>}
      </span>
      {/* Same text as the real button (not the title row's capitals and spacing), so the columns line up. */}
      <span className="invisible h-0 shrink-0 overflow-hidden border border-transparent px-2.5 text-xs font-medium normal-case tracking-normal">History</span>
    </li>
  );
  const row = (g: PickerFieldGolfer) => {
    const on = chosen.includes(g.espn_golfer_id);
    const tooMuch = contest === "salary" && !on && (chosen.length >= roster || (g.salary ?? 0) > left);
    return (
      // The row picks the golfer; History at the end opens their past results (as in the season pool).
      <li key={g.espn_golfer_id} className={`flex items-center gap-1.5 pr-1 ${on ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : ""}`}>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => toggle(g)}
          aria-pressed={on}
          className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left text-sm ${on ? "" : "enabled:hover:bg-surface"} ${tooMuch ? "opacity-45" : ""}`}
        >
          <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-accent bg-accent text-bg" : "border-faint"}`}>
            {on && <CheckIcon className="size-3" />}
          </span>
          <span className={`min-w-0 flex-1 truncate font-medium ${on ? "text-accent" : ""}`}>{g.golfer_name}</span>
          <span className="w-10 shrink-0 text-center text-xs tabular-nums text-muted">{g.world_rank ? `#${g.world_rank}` : "NR"}</span>
          {hasOdds && (
            <span className={`w-16 shrink-0 whitespace-nowrap text-center tabular-nums text-muted ${g.odds === null ? "text-[10px] text-faint" : "text-xs"}`}>
              {g.odds === null ? "Not Available" : oddsLabel(g.odds)}
            </span>
          )}
          {contest === "salary" && <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{dollars(g.salary!)}</span>}
        </button>
        <button
          type="button"
          onClick={() => setHistoryFor(g)}
          aria-label={`${g.golfer_name}: history`}
          className="relative h-7 shrink-0 rounded-full border border-line bg-bg px-2.5 text-xs font-medium text-ink after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] hover:bg-hover"
        >
          History
        </button>
      </li>
    );
  };

  const lineup = chosen.map((id) => byId.get(id)).filter((g): g is PickerFieldGolfer => !!g);
  const complete = contest === "tiers" ? picks.every((n, i) => inTier(i + 1) === n) : chosen.length === roster && left >= 0;

  return (
    <div>
      {/* The lineup so far, outlined in blue: filled slots solid, empty ones dashed. */}
      <div className="mb-3 rounded-lg border-2 border-accent bg-surface p-3">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide text-accent">
            My Lineup · {chosen.length} of {need}
          </span>
          {contest === "salary" && (
            <span className="tabular-nums">
              Left <span className={`font-semibold ${left < 0 ? "text-loss" : "text-ink"}`}>{dollars(left)}</span>
              {chosen.length < roster && left > 0 && <> · {dollars(Math.floor(left / (roster - chosen.length)))} per golfer</>}
            </span>
          )}
        </div>
        {contest === "tiers" ? (
          // A slot for every pick, Tier 1 to the last tier in order; empty slots wait to be filled.
          <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
            {picks.flatMap((n, i) => {
              const t = i + 1;
              const inT = lineup.filter((g) => g.tier === t);
              return Array.from({ length: n }, (_, k) => {
                const g = inT[k];
                return (
                  <li key={`${t}-${k}`} className="min-w-0">
                    {g ? (
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => toggle(g)}
                        className="flex h-11 w-full min-w-0 flex-col justify-center rounded-lg bg-bg px-2.5 text-left ring-1 ring-accent enabled:hover:ring-2"
                        title={readOnly ? undefined : `Remove ${g.golfer_name}`}
                      >
                        <span className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          Tier {t}
                          {!readOnly && <span aria-hidden>×</span>}
                        </span>
                        <span className="truncate text-xs font-semibold">{g.golfer_name}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTier(t)}
                        className="flex h-11 w-full flex-col justify-center rounded-lg border border-dashed border-[color-mix(in_srgb,var(--accent)_55%,transparent)] px-2.5 text-left lg:cursor-default"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Tier {t}</span>
                        <span className="text-xs text-faint">Pick a golfer</span>
                      </button>
                    )}
                  </li>
                );
              });
            })}
          </ol>
        ) : lineup.length === 0 ? (
          <p className="text-sm text-muted">{readOnly ? "No lineup." : "Add golfers below."}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {[...lineup].sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0)).map((g) => (
              <li key={g.espn_golfer_id}>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggle(g)}
                  className="inline-flex h-7 items-center gap-1 rounded-full bg-bg px-2.5 text-xs font-medium ring-1 ring-accent enabled:hover:ring-2"
                  title={readOnly ? undefined : `Remove ${g.golfer_name}`}
                >
                  <span className="tabular-nums text-muted">{dollars(g.salary!)}</span>
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

      {oddsNote && <p className="-mt-1 mb-3 text-[11px] text-muted">{oddsNote}</p>}

      {contest === "tiers" && (
        // Phones and tablets: one tier at a time, chosen here. Desktop shows every tier.
        <div className="mb-3 flex flex-wrap gap-1.5 lg:hidden" role="group" aria-label="Tier">
          {picks.map((n, i) => (
            <button key={i} type="button" onClick={() => setTier(i + 1)} aria-pressed={tier === i + 1} className={chipClass(tier === i + 1, "", "sm")}>
              {inTier(i + 1) === n && <CheckIcon className="mr-1 size-3" />}
              Tier {i + 1}
              <span className="ml-1 font-normal tabular-nums opacity-70">
                {inTier(i + 1)}/{n}
              </span>
            </button>
          ))}
        </div>
      )}

      {contest === "tiers" ? (
        // Desktop: every tier side by side, each the same height; the last (largest) tier
        // scrolls within that height.
        <div
          className="grid gap-4 lg:grid-cols-3 2xl:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]"
        >
          {picks.map((n, i) => {
            const t = i + 1;
            const rows = sorted(golfers.filter((g) => g.tier === t));
            const done = inTier(t) === n;
            return (
              <section key={t} aria-label={`Tier ${t}`} className={`min-w-0 lg:flex lg:flex-col ${tier === t || (query.trim() && rows.length) ? "block" : "hidden"}`}>
                <h3 className="flex items-center justify-between gap-2 border-b-2 border-accent pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span className="flex items-center gap-1">
                    {done && <CheckIcon className="size-3 text-win" />}
                    Tier {t} – Make {n} {n === 1 ? "Selection" : "Selections"}
                  </span>
                  <span className="font-normal normal-case tracking-normal tabular-nums">
                    {inTier(t)}/{n}
                  </span>
                </h3>
                {/* Tiers 1–5 show in full. The last tier takes the height of the others in its row
                    (contain: size keeps its long list from stretching the row) and scrolls inside it. */}
                <ul
                  className={`divide-y divide-line ${
                    t === picks.length ? "lg:min-h-[12rem] lg:flex-1 lg:overflow-y-auto lg:[contain:size]" : ""
                  }`}
                >
                  {/* Stays in view while the last tier's long list scrolls. */}
                  {rows.length > 0 && header("sticky top-0 z-10 bg-bg")}
                  {rows.map((g) => row(g))}
                  {rows.length === 0 && <li className="py-2 text-sm text-muted">{query ? "No golfers match." : "No golfers."}</li>}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        // The whole field in columns across the screen.
        <>
        {/* Column titles, one per column of golfers across the screen. */}
        <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3 border-b-2 border-accent">
          {header()}
          {header("max-sm:hidden")}
          {header("max-xl:hidden")}
        </ul>
        <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3 [&>li]:border-b [&>li]:border-line">
          {sorted(golfers.filter((g) => g.salary !== null)).map((g) => row(g))}
        </ul>
        </>
      )}

      {!readOnly && (
        // Fixed to the bottom of the screen the whole time (the page leaves room for it), one
        // slim row: the tier checklist and the button.
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-line bg-bg py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          {/* What each tier still needs; a tier turns green with a check once it's filled. */}
          {contest === "tiers" ? (
            <>
              {/* Phones: a numbered dot per tier (tap to go to it). */}
              <ol className="flex min-w-0 flex-1 items-center gap-1 sm:hidden" aria-label="Picks by tier">
                {picks.map((n, i) => {
                  const done = inTier(i + 1) >= n;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setTier(i + 1)}
                        aria-label={`Tier ${i + 1}: ${done ? "complete" : `${n - inTier(i + 1)} needed`}`}
                        className={`grid size-7 place-items-center rounded-full text-[11px] font-semibold tabular-nums ${
                          done ? "bg-[color-mix(in_srgb,var(--win)_18%,transparent)] text-win" : tier === i + 1 ? "bg-ink text-bg" : "bg-surface text-ink"
                        }`}
                      >
                        {done ? <CheckIcon className="size-3" /> : i + 1}
                      </button>
                    </li>
                  );
                })}
              </ol>
              {/* Larger screens: each tier and what it still needs. */}
              <ul className="hidden min-w-0 flex-1 flex-wrap gap-1 sm:flex" aria-label="Picks by tier">
                {picks.map((n, i) => {
                  const have = inTier(i + 1);
                  const done = have >= n;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setTier(i + 1)}
                        className={`inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium lg:cursor-default ${
                          done ? "bg-[color-mix(in_srgb,var(--win)_16%,transparent)] text-win" : "bg-surface text-ink"
                        }`}
                      >
                        {done && <CheckIcon className="size-2.5" />}
                        Tier {i + 1}
                        <span className={`font-normal ${done ? "" : "text-muted"}`}>{done ? "Complete" : `${n - have} needed`}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <span className="min-w-0 flex-1 text-xs tabular-nums text-muted">
              {chosen.length}/{roster} · Left <span className={left < 0 ? "font-semibold text-loss" : "font-semibold text-ink"}>{dollars(left)}</span>
            </span>
          )}
          {/* Only problems get a message; the button itself says when the lineup is saved. */}
          {(state?.error || (contest === "salary" && left < 0)) && (
            <p className="min-w-0 max-w-[40%] shrink truncate text-xs font-semibold text-loss" title={state?.error ?? undefined}>{state?.error ?? "Over the budget."}</p>
          )}
          <button
            type="button"
            disabled={!complete || saved || pending}
            onClick={() => start(async () => setState(await save(chosen)))}
            className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-4 text-sm font-semibold disabled:cursor-default ${
              saved && complete ? "bg-[color-mix(in_srgb,var(--win)_16%,transparent)] text-win" : "bg-accent text-bg disabled:opacity-40"
            }`}
          >
            {pending ? (
              "Saving…"
            ) : saved && complete ? (
              <>
                <CheckIcon className="size-3.5" />
                Lineup Saved
              </>
            ) : initial.length ? (
              "Save Changes"
            ) : (
              "Save Lineup"
            )}
          </button>
        </div>
      )}
      {historyFor && (
        <GolferHistoryDialog
          key={historyFor.espn_golfer_id}
          golfer={{ id: historyFor.espn_golfer_id, name: historyFor.golfer_name, rank: historyFor.world_rank }}
          history={history}
          season={season}
          majors
          onClose={() => setHistoryFor(null)}
          onPick={readOnly || chosen.includes(historyFor.espn_golfer_id) ? undefined : () => toggle(historyFor)}
        />
      )}
    </div>
  );
}
