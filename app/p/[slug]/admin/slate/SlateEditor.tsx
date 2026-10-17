"use client";

import { useMemo, useState, useTransition } from "react";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, type ActionState } from "@/components/ActionForm";
import { Button, Card, Field, TeamLogo, inputClass } from "@/components/ui";
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
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <ActionButton action={syncSchedule.bind(null, slug)} pendingLabel="Syncing…">Sync ESPN schedule</ActionButton>
        <ActionButton action={refreshLines.bind(null, slug)} pendingLabel="Pulling…">Refresh lines</ActionButton>
        {settings.pickType === "ats" && (
          <ActionButton action={freezeLines.bind(null, slug, slateId)} pendingLabel="Freezing…">Freeze lines for review</ActionButton>
        )}
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <h2 className="font-display text-xl font-bold uppercase">On this slate</h2>
          <span className={`font-display text-lg font-bold tabular-nums ${shortBy ? "text-live" : "text-win"}`}>{onSlate.length}</span>
          <span className="text-sm text-muted">/ {need}+ needed</span>
        </div>
        {onSlate.length === 0 ? (
          <p className="p-4 text-sm text-muted">No games yet. Add some below.</p>
        ) : (
          <ul className="divide-y divide-border">
            {onSlate.map((g) => (
              <li key={g.id} className="flex items-center gap-2 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {g.awayRank && <span className="mr-0.5 text-xs text-muted">{g.awayRank}</span>}
                    {g.away.short_name} <span className="text-muted">{g.neutral ? "vs" : "@"}</span>{" "}
                    {g.homeRank && <span className="mr-0.5 text-xs text-muted">{g.homeRank}</span>}
                    {g.home.short_name}
                  </div>
                  <div className="text-xs text-muted">
                    {g.timeTbd ? <span className="font-semibold text-live">Time TBD</span> : gameTime(g.startAt, tz)}
                    {g.tv && ` · ${g.tv}`} · line {formatSpread(g.line)}
                  </div>
                </div>
                {settings.pickType === "ats" && (
                  <SpreadInput slug={slug} slateId={slateId} gameId={g.id} value={g.spread} homeAbbr={g.home.abbreviation} />
                )}
                <ActionButton action={removeGame.bind(null, slug, slateId, g.id)} kind="ghost" className="!min-h-9 !px-3 text-sm" pendingLabel="…">
                  Remove
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 border-t border-border p-4">
          {tbdCount > 0 && (
            <p className="text-sm text-live">
              {tbdCount} game{tbdCount === 1 ? " has" : "s have"} no announced tip time. ESPN lists them at midnight Eastern, so picks on them lock then.
            </p>
          )}
          {missingLines > 0 && <p className="text-sm text-live">{missingLines} game{missingLines === 1 ? "" : "s"} still need a line.</p>}
          {settings.pickType === "ats" && (
            <p className="text-xs text-muted">Spreads are from the home team&apos;s side (−3.5 = home favored). They freeze when you publish.</p>
          )}
          <div className="flex flex-wrap items-start gap-2">
            <ActionButton action={publishSlate.bind(null, slug, slateId)} kind="brass" pendingLabel="Publishing…">
              Publish slate
            </ActionButton>
            <form action={deleteSlate.bind(null, slug, slateId)}>
              <Button kind="danger">Delete draft</Button>
            </form>
          </div>
          {shortBy > 0 && <p className="text-xs text-muted">Add {shortBy} more game{shortBy === 1 ? "" : "s"} before publishing.</p>}
        </div>
      </Card>

      <section>
        <h2 className="mb-2 font-display text-xl font-bold uppercase">Add games</h2>
        <div className="mb-2 flex flex-wrap gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search team" className={`${inputClass} max-w-48 !min-h-9`} />
          <select value={day} onChange={(e) => setDay(e.target.value)} className={`${inputClass} max-w-40 !min-h-9`}>
            <option value="">All days</option>
            {days.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select value={conference} onChange={(e) => setConference(e.target.value)} className={`${inputClass} max-w-40 !min-h-9`}>
            <option value="">All conferences</option>
            {conferences.map((c) => <option key={c}>{c}</option>)}
          </select>
          <Chip on={rankedOnly} onClick={() => setRankedOnly(!rankedOnly)}>Ranked</Chip>
          <Chip on={tvOnly} onClick={() => setTvOnly(!tvOnly)}>National TV</Chip>
        </div>
        <p className="mb-2 text-xs text-muted">
          {filtered.length} of {candidates.length} upcoming games in this window
          {candidates.length === 0 && " — try Sync ESPN schedule"}
        </p>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {filtered.map((c) => (
            <li key={c.id}>
              <label className={`flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5 ${selected.has(c.id) ? "bg-brass/15" : ""}`}>
                <input type="checkbox" className="size-5 accent-[var(--felt)]" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                <TeamLogo src={c.away.logo_url} abbr={c.away.abbreviation} className="size-6" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.awayRank && <span className="mr-0.5 text-xs text-muted">{c.awayRank}</span>}
                    {c.away.short_name ?? c.away.name} {c.neutral ? "vs" : "@"}{" "}
                    {c.homeRank && <span className="mr-0.5 text-xs text-muted">{c.homeRank}</span>}
                    {c.home.short_name ?? c.home.name}
                  </span>
                  <span className="block text-xs text-muted">
                    {c.timeTbd ? <span className="text-live">TBD</span> : gameTime(c.startAt, tz)}
                    {c.tv && ` · ${c.tv}`}
                    {(c.home.conference || c.away.conference) && ` · ${[...new Set([c.away.conference, c.home.conference].filter(Boolean))].join("/")}`}
                  </span>
                </span>
                <span className="font-display text-sm font-semibold tabular-nums text-muted">{formatSpread(c.line)}</span>
                <TeamLogo src={c.home.logo_url} abbr={c.home.abbreviation} className="size-6" />
              </label>
            </li>
          ))}
        </ul>
        {selected.size > 0 && (
          <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface/95 backdrop-blur sm:bottom-0">
            <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
              <span className="flex-1 text-sm">
                {selected.size} selected
                {addResult?.error && <span className="ml-2 text-loss">{addResult.error}</span>}
              </span>
              <button type="button" className="text-sm text-muted" onClick={() => setSelected(new Set())}>Clear</button>
              <Button
                kind="brass"
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
        )}
      </section>

      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer font-display text-lg font-bold uppercase">Enter a game by hand</summary>
        <ActionForm action={addManualGame.bind(null, slug, slateId)} className="mt-3 grid gap-3 sm:grid-cols-2">
          {(pending) => (
            <>
              <Field label="Away team">
                <select name="away" required className={inputClass}>
                  <option value="">Choose…</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Home team">
                <select name="home" required className={inputClass}>
                  <option value="">Choose…</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label={`Start (${tz.replace("America/", "")} time)`}>
                <input type="datetime-local" name="start" required defaultValue={defaultManualStart} className={inputClass} />
              </Field>
              <Field label="TV (optional)">
                <input name="tv" className={inputClass} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="neutral" className="size-5 accent-[var(--felt)]" /> Neutral site
              </label>
              <Button kind="ghost" disabled={pending} className="sm:col-start-2">{pending ? "Adding…" : "Add to slate"}</Button>
            </>
          )}
        </ActionForm>
      </details>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-9 rounded-full border px-3 text-sm ${on ? "border-felt bg-felt text-white" : "border-border bg-surface"}`}
    >
      {children}
    </button>
  );
}

function SpreadInput({ slug, slateId, gameId, value, homeAbbr }: { slug: string; slateId: string; gameId: string; value: number | null; homeAbbr: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="flex flex-col items-end text-xs text-muted">
      <span>{homeAbbr ?? "Home"}</span>
      <input
        defaultValue={value === null ? "" : String(value)}
        inputMode="decimal"
        placeholder="—"
        aria-label={`Home spread (${homeAbbr ?? "home"})`}
        className={`w-16 rounded-md border px-2 py-1 text-right font-display text-base font-bold tabular-nums text-ink ${error ? "border-loss" : "border-border"} ${pending ? "opacity-50" : ""}`}
        onBlur={(e) => {
          const v = e.target.value;
          if (v === (value === null ? "" : String(value))) return;
          start(async () => {
            const r = await setSpread(slug, slateId, gameId, v);
            setError(r?.error ?? null);
          });
        }}
      />
      {error && <span className="max-w-32 text-right text-loss">{error}</span>}
    </label>
  );
}
