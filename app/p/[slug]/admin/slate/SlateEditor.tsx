"use client";

import { useMemo, useState, useTransition } from "react";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ActionForm";
import { Button, Cell, Field, SectionLabel, TeamLogo, buttonClass, chipClass, inputClass } from "@/components/ui";
import { dayKey, dayLabel, formatSpread, gameTime } from "@/lib/format";
import type { SlateGame } from "@/lib/pool";
import {
  addGames,
  addManualGame,
  deleteSlate,
  freezeLines,
  publishSlate,
  refreshLines,
  removeGame,
  setSpread,
  syncSchedule,
} from "../actions";

type Team = { name: string; short_name: string | null; abbreviation: string | null; conference: string | null; logo_url: string | null };
export type Candidate = {
  id: string;
  startAt: string;
  timeTbd: boolean;
  tv: string | null;
  homeRank: number | null;
  awayRank: number | null;
  neutral: boolean;
  home: Team;
  away: Team;
  line: number | null;
};
type Settings = { pickType: "straight_up" | "ats"; picksPerSlate: number; picksMode: "exact" | "max"; timezone: string; bookmaker: string };

// Rough "national TV" check for the filter; regional/streaming-only games don't match.
const NATIONAL = /^(ESPN|ESPN2|ESPNU|ABC|CBS|FOX|FS1|TNT|TBS|truTV|NBC|Peacock|BTN|SECN|ACCN|CBSSN)\b/i;

// Filter controls size to their content instead of filling the row.
const filterInput = inputClass.replace("w-full ", "");
// Inputs inside the bg-surface manual-entry panel take the page color to stay visible.
const panelInput = inputClass.replace("bg-surface", "bg-bg");
const smallButton = "!px-4 !text-sm";

export function SlateEditor({
  slug,
  slateId,
  onSlate,
  candidates,
  teams,
  settings,
  defaultManualStart,
}: {
  slug: string;
  slateId: string;
  onSlate: (SlateGame & { line: number | null })[];
  candidates: Candidate[];
  teams: { id: string; name: string }[];
  settings: Settings;
  defaultManualStart: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [conference, setConference] = useState("");
  const [day, setDay] = useState("");
  const [rankedOnly, setRankedOnly] = useState(false);
  const [tvOnly, setTvOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, startAdding] = useTransition();
  const [addResult, setAddResult] = useState<ActionState>(null);
  const tz = settings.timezone;

  const conferences = useMemo(
    () => [...new Set(candidates.flatMap((c) => [c.home.conference, c.away.conference]).filter(Boolean) as string[])].sort(),
    [candidates],
  );
  const days = useMemo(() => [...new Map(candidates.map((c) => [dayKey(c.startAt, tz), dayLabel(c.startAt, tz)])).entries()], [candidates, tz]);

  const filtered = candidates.filter((c) => {
    if (conference && c.home.conference !== conference && c.away.conference !== conference) return false;
    if (day && dayKey(c.startAt, tz) !== day) return false;
    if (rankedOnly && !c.homeRank && !c.awayRank) return false;
    if (tvOnly && !(c.tv && NATIONAL.test(c.tv))) return false;
    if (query) {
      const q = query.toLowerCase();
      if (![c.home.name, c.away.name, c.home.abbreviation, c.away.abbreviation].some((s) => s?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const need = settings.picksPerSlate;
  const shortBy = settings.picksMode === "exact" ? Math.max(0, need - onSlate.length) : 0;
  const tbdCount = onSlate.filter((g) => g.timeTbd).length;
  const missingLines = settings.pickType === "ats" ? onSlate.filter((g) => g.spread === null).length : 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap gap-2">
        <ActionButton action={syncSchedule.bind(null, slug)} pendingLabel="Syncing…" className={smallButton}>Sync ESPN schedule</ActionButton>
        <ActionButton action={refreshLines.bind(null, slug)} pendingLabel="Pulling…" className={smallButton}>Refresh lines</ActionButton>
        {settings.pickType === "ats" && (
          <ActionButton action={freezeLines.bind(null, slug, slateId)} pendingLabel="Freezing…" className={smallButton}>Freeze lines for review</ActionButton>
        )}
      </div>

      <section>
        <div className="flex items-baseline gap-2 border-b border-line pb-2">
          <SectionLabel>On this slate</SectionLabel>
          <span className="text-xs text-muted tabular-nums">
            <span className={`font-semibold ${shortBy ? "text-loss" : "text-ink"}`}>{onSlate.length}</span> / {need}+ needed
          </span>
        </div>
        {onSlate.length === 0 ? (
          <p className="py-6 text-sm text-muted">No games yet. Add some below.</p>
        ) : (
          <ul className="divide-y divide-line">
            {onSlate.map((g) => (
              <li key={g.id} className="flex min-h-14 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">
                    {g.awayRank && <span className="mr-1 text-xs font-medium text-muted tabular-nums">{g.awayRank}</span>}
                    {g.away.short_name} <span className="font-normal text-muted">{g.neutral ? "vs" : "@"}</span>{" "}
                    {g.homeRank && <span className="mr-1 text-xs font-medium text-muted tabular-nums">{g.homeRank}</span>}
                    {g.home.short_name}
                  </div>
                  <div className="truncate text-xs text-muted tabular-nums">
                    {g.timeTbd ? <span className="font-semibold text-ink">Time TBD</span> : gameTime(g.startAt, tz)}
                    {g.tv && ` · ${g.tv}`} · line {formatSpread(g.line)}
                  </div>
                </div>
                {settings.pickType === "ats" && (
                  <SpreadInput slug={slug} slateId={slateId} gameId={g.id} value={g.spread} homeAbbr={g.home.abbreviation} />
                )}
                <ActionButton action={removeGame.bind(null, slug, slateId, g.id)} kind="ghost" className="!px-2 !text-sm hover:!text-loss" pendingLabel="…">
                  Remove
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-3 border-t border-line pt-4">
          {tbdCount > 0 && (
            <p className="text-sm font-semibold text-ink">
              {tbdCount} game{tbdCount === 1 ? " has" : "s have"} no announced tip time. ESPN lists them at midnight Eastern, so picks on them lock then.
            </p>
          )}
          {missingLines > 0 && <p className="text-sm text-loss">{missingLines} game{missingLines === 1 ? "" : "s"} still need a line.</p>}
          {settings.pickType === "ats" && (
            <p className="text-xs text-muted">Spreads are from the home team&apos;s side (−3.5 = home favored). They freeze when you publish.</p>
          )}
          <div className="flex flex-wrap items-start gap-2">
            <ActionButton action={publishSlate.bind(null, slug, slateId)} kind="primary" pendingLabel="Publishing…">
              Publish slate
            </ActionButton>
            <form action={deleteSlate.bind(null, slug, slateId)}>
              <Button kind="danger">Delete draft</Button>
            </form>
          </div>
          {shortBy > 0 && <p className="text-xs text-muted">Add {shortBy} more game{shortBy === 1 ? "" : "s"} before publishing.</p>}
        </div>
      </section>

      <section className={selected.size > 0 ? (addResult?.error ? "pb-32" : "pb-20") : ""}>
        <SectionLabel className="mb-3">Add games</SectionLabel>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team"
            aria-label="Search team"
            className={`${filterInput} w-full sm:w-48`}
          />
          <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" className={`${filterInput} min-w-0 flex-1 sm:max-w-40 sm:flex-none`}>
            <option value="">All days</option>
            {days.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select value={conference} onChange={(e) => setConference(e.target.value)} aria-label="Conference" className={`${filterInput} min-w-0 flex-1 sm:max-w-44 sm:flex-none`}>
            <option value="">All conferences</option>
            {conferences.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button type="button" aria-pressed={rankedOnly} onClick={() => setRankedOnly(!rankedOnly)} className={chipClass(rankedOnly, "min-h-11")}>
            Ranked
          </button>
          <button type="button" aria-pressed={tvOnly} onClick={() => setTvOnly(!tvOnly)} className={chipClass(tvOnly, "min-h-11")}>
            National TV
          </button>
        </div>
        <div className="flex items-end justify-between gap-3 border-b border-line pb-2 text-xs text-muted">
          <p className="tabular-nums">
            {filtered.length} of {candidates.length} upcoming games in this window
            {candidates.length === 0 && " — try Sync ESPN schedule"}
          </p>
          <span className="w-16 shrink-0 text-center">Home line</span>
        </div>
        <ul className="divide-y divide-line">
          {filtered.map((c) => {
            const on = selected.has(c.id);
            return (
              <li key={c.id}>
                <label className="flex min-h-16 cursor-pointer items-center gap-3 py-2">
                  <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" checked={on} onChange={() => toggle(c.id)} />
                  <span className="flex shrink-0 -space-x-1.5">
                    <TeamLogo src={c.away.logo_url} abbr={c.away.abbreviation} className="size-7" />
                    <TeamLogo src={c.home.logo_url} abbr={c.home.abbreviation} className="size-7" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {c.awayRank && <span className="mr-1 text-xs font-medium text-muted tabular-nums">{c.awayRank}</span>}
                      {c.away.short_name ?? c.away.name} <span className="font-normal text-muted">{c.neutral ? "vs" : "@"}</span>{" "}
                      {c.homeRank && <span className="mr-1 text-xs font-medium text-muted tabular-nums">{c.homeRank}</span>}
                      {c.home.short_name ?? c.home.name}
                    </span>
                    <span className="block truncate text-xs text-muted tabular-nums">
                      {c.timeTbd ? <span className="font-semibold text-ink">TBD</span> : gameTime(c.startAt, tz)}
                      {c.tv && ` · ${c.tv}`}
                      {(c.home.conference || c.away.conference) && ` · ${[...new Set([c.away.conference, c.home.conference].filter(Boolean))].join("/")}`}
                    </span>
                  </span>
                  <Cell value={formatSpread(c.line)} selected={on} className="w-16 shrink-0" />
                </label>
              </li>
            );
          })}
        </ul>
        {selected.size > 0 && (
          <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-bg/90 backdrop-blur sm:bottom-0 sm:pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto max-w-3xl py-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
              {/* The error gets its own line so a long one can't squeeze the buttons. */}
              {addResult?.error && <p className="mb-1.5 text-sm text-loss" role="alert">{addResult.error}</p>}
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-sm tabular-nums">{selected.size} selected</span>
                <button type="button" className={buttonClass("ghost", "!px-3 !text-sm")} onClick={() => setSelected(new Set())}>Clear</button>
                <Button
                  kind="primary"
                  disabled={adding}
                  onClick={() =>
                    startAdding(async () => {
                      const r = await addGames(slug, slateId, [...selected]);
                      setAddResult(r);
                      if (!r?.error) setSelected(new Set());
                    })
                  }
                >
                  {adding ? "Adding…" : `Add ${selected.size} game${selected.size === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      <details className="rounded-2xl bg-surface px-4">
        <summary className="flex min-h-12 cursor-pointer items-center text-[15px] font-semibold">Enter a game by hand</summary>
        <ActionForm action={addManualGame.bind(null, slug, slateId)} className="grid gap-3 pb-4 pt-1 sm:grid-cols-2">
          <Field label="Away team">
            <select name="away" required className={panelInput}>
              <option value="">Choose…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Home team">
            <select name="home" required className={panelInput}>
              <option value="">Choose…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label={`Start (${tz.replace("America/", "")} time)`}>
            <input type="datetime-local" name="start" required defaultValue={defaultManualStart} className={panelInput} />
          </Field>
          <Field label="TV (optional)">
            <input name="tv" className={panelInput} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="neutral" className="size-5 accent-[var(--accent)]" /> Neutral site
          </label>
          <SubmitButton kind="primary" pending="Adding…" className="sm:col-start-2">Add to slate</SubmitButton>
        </ActionForm>
      </details>
    </div>
  );
}

function SpreadInput({ slug, slateId, gameId, value, homeAbbr }: { slug: string; slateId: string; gameId: string; value: number | null; homeAbbr: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="font-medium">{homeAbbr ?? "Home"}</span>
        <input
          defaultValue={value === null ? "" : String(value)}
          inputMode="decimal"
          placeholder="—"
          aria-label={`Home spread (${homeAbbr ?? "home"})`}
          className={`h-11 w-16 rounded-[10px] bg-surface px-2 text-right text-[15px] font-semibold tabular-nums text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-accent ${
            error ? "ring-1 ring-loss" : ""
          } ${pending ? "opacity-50" : ""}`}
          onBlur={(e) => {
            const v = e.target.value;
            if (v === (value === null ? "" : String(value))) return;
            start(async () => {
              const r = await setSpread(slug, slateId, gameId, v);
              setError(r?.error ?? null);
            });
          }}
        />
      </span>
      {error && <span className="max-w-32 text-right text-loss" role="alert">{error}</span>}
    </label>
  );
}
