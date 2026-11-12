"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "./ActionForm";
import type { FieldHistory } from "@/lib/golfFieldHistory";
import { GolferHistoryDialog } from "./GolferHistoryDialog";
import { inputClass } from "./ui";

export type PickerGolfer = {
  id: string;
  name: string;
  /** Last name, for A–Z sorting. */
  lastName: string;
  /** Tee time as shown ("Thu 7:40 AM"), and its ISO time for sorting. */
  teeLabel: string | null;
  tee: string | null;
  /** Official World Golf Ranking; null outside the top 300 or not matched. */
  rank: number | null;
  /** The week this entry already used the golfer, if any. */
  usedWeek: number | null;
};

type Sort = "tee" | "rank" | "name";

const plain = (s: string) => s.normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, "").toLowerCase();

/**
 * The field for the open event: search by name, sort by tee time, world rank or name, and pick
 * one. Golfers already used this season are listed but can't be chosen. Each golfer's History button
 * opens their past results.
 */
export function GolfPicker({
  action,
  golfers,
  currentId,
  forUserId,
  history,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  golfers: PickerGolfer[];
  currentId: string | null;
  /** Set when a co-manager picks for the entry's owner. */
  forUserId: string | null;
  /** Past results for the whole field; resolves once loaded, shortly after the page. */
  history: Promise<FieldHistory>;
}) {
  const [query, setQuery] = useState("");
  const hasTees = golfers.some((g) => g.tee);
  // World rank first; tee time and name are a tap away.
  const [sort, setSort] = useState<Sort>("rank");
  const [selected, setSelected] = useState<string | null>(currentId);
  const [historyFor, setHistoryFor] = useState<PickerGolfer | null>(null);

  const sorted = useMemo(() => {
    const byName = (a: PickerGolfer, b: PickerGolfer) => a.lastName.localeCompare(b.lastName) || a.name.localeCompare(b.name);
    const cmp: Record<Sort, (a: PickerGolfer, b: PickerGolfer) => number> = {
      tee: (a, b) => (a.tee ?? "~").localeCompare(b.tee ?? "~") || byName(a, b),
      rank: (a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || byName(a, b),
      name: byName,
    };
    return [...golfers].sort(cmp[sort]);
  }, [golfers, sort]);

  const q = plain(query.trim());
  const visible = q ? sorted.filter((g) => plain(g.name).includes(q)) : sorted;
  const available = golfers.filter((g) => !g.usedWeek).length;
  const chosen = golfers.find((g) => g.id === selected);
  const changed = selected !== currentId;

  return (
    <ActionForm action={action} className="mt-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      {forUserId && <input type="hidden" name="for" value={forUserId} />}
      {/* The choice is submitted from here, so a search that hides it doesn't drop it. */}
      {selected && <input type="hidden" name="golfer" value={selected} />}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the Field"
          aria-label="Search the field"
          className={`${inputClass.replace("h-11", "h-9")} min-w-0 flex-1 basis-48`}
        />
        <div className="flex gap-1 text-xs" role="group" aria-label="Sort by">
          {(
            [
              ["rank", "World Rank"],
              ["tee", "Tee Time"],
              ["name", "Name"],
            ] as const
          )
            .filter(([k]) => k !== "tee" || hasTees)
            .map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                aria-pressed={sort === k}
                className={`h-8 rounded-full px-2.5 font-medium ${sort === k ? "bg-ink text-bg" : "bg-surface text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {golfers.length} in the Field · {available} Available to You
      </p>

      <ul className="mt-1.5 max-h-[60vh] divide-y divide-line overflow-y-auto rounded-lg border border-line [scrollbar-gutter:stable] lg:max-h-none lg:min-h-0 lg:flex-1" aria-label="Field">
        {visible.length === 0 && <li className="px-3 py-4 text-sm text-muted">No golfer matches “{query}”.</li>}
        {visible.map((g) => {
          const used = !!g.usedWeek;
          const isSelected = g.id === selected;
          return (
            <li
              key={g.id}
              // The whole row picks the golfer; "History" at the end opens their past results.
              // Clicking the selected golfer again unselects them.
              onClick={() => !used && setSelected(isSelected ? null : g.id)}
              className={`flex min-h-11 items-center gap-2.5 py-2 pl-3 pr-4 text-sm sm:gap-3 ${
                isSelected
                  ? "cursor-pointer bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] shadow-[inset_4px_0_0_var(--accent)]"
                  : used
                    ? "opacity-60"
                    : "cursor-pointer hover:bg-surface"
              }`}
            >
              <button
                type="button"
                disabled={used}
                aria-pressed={isSelected}
                aria-label={`Pick ${g.name}`}
                className={`relative grid size-4 shrink-0 place-items-center rounded-full border after:absolute after:-inset-3 after:content-[''] ${
                  isSelected ? "border-accent" : "border-line"
                } ${used ? "cursor-not-allowed" : ""}`}
              >
                {isSelected && <span className="size-2 rounded-full bg-accent" />}
              </button>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${isSelected ? "font-bold" : "font-medium"} ${used ? "line-through decoration-1" : ""}`}>{g.name}</span>
                {g.teeLabel && <span className="block text-xs text-muted">{g.teeLabel}</span>}
              </span>
              {used ? (
                <span className="shrink-0 text-xs text-muted">Used · Wk {g.usedWeek}</span>
              ) : isSelected ? (
                <span className="shrink-0 text-xs font-semibold text-accent">{g.id === currentId ? "Your pick" : "Selected"}</span>
              ) : g.id === currentId ? (
                <span className="shrink-0 text-xs font-semibold text-accent">Your Pick</span>
              ) : null}
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted sm:w-12">{g.rank ? `#${g.rank}` : "–"}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setHistoryFor(g);
                }}
                aria-label={`${g.name}: history`}
                className="relative h-7 shrink-0 rounded-full border border-line bg-bg px-2.5 text-xs font-medium text-ink after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] hover:bg-hover"
              >
                History
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm">
          {chosen ? (
            <>
              <span className="text-muted">{changed ? "Selected: " : "Current Pick: "}</span>
              <span className="font-semibold">{chosen.name}</span>
            </>
          ) : (
            <span className="text-muted">Choose a Golfer</span>
          )}
        </span>
        <SubmitButton disabled={!selected || !changed}>{currentId ? "Change Pick" : "Save Pick"}</SubmitButton>
      </div>

      {historyFor && (
        <GolferHistoryDialog
          key={historyFor.id}
          golfer={historyFor}
          history={history}
          onClose={() => setHistoryFor(null)}
          onPick={historyFor.usedWeek ? undefined : () => setSelected(historyFor.id)}
        />
      )}
    </ActionForm>
  );
}
