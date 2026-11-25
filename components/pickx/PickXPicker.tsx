"use client";

import { useRef, useState, type ReactNode } from "react";
import { CheckIcon, TeamLogo, chipClass } from "@/components/ui";
import { Shell } from "@/components/ProfileDialogs";
import { ROUNDS } from "@/lib/bracket";
import { FitText } from "@/components/FitText";
import { GridPanelDrawer } from "@/components/GridPanelDrawer";
import { blockedReason, picksError, seedAt, winPoints, type PickXSettings } from "@/lib/pickx";

type Team = { id: string; name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null };
const nameOf = (t: Team) => t.short_name ?? t.name;

/**
 * Choose the entry's teams from the tournament field, region by region in seed order, like
 * Playoff Fantasy's My Team: each Add saves on its own; teams that would break a rule are dimmed
 * with the reason. Filter by region or seed line; tap a team for its pod of the bracket. The picks so far sit on the left (desktop) or in a drawer from the footer bar
 * (phones); the bar along the bottom shows the count, seed total and save status.
 */
export function PickXPicker({
  field,
  regions,
  initial,
  settings,
  save,
  forName,
  lockText,
  scoringInfo,
  tiebreak,
}: {
  /** 64 slots (region * 16 + bracket position); null where the commissioner hasn't set a team. */
  field: (Team | null)[];
  regions: string[];
  initial: string[];
  settings: PickXSettings;
  save: (teamIds: string[]) => Promise<{ error?: string }>;
  /** The commissioner picking for someone. */
  forName?: string;
  /** "Locks Thu, Mar 19 · 11:15 AM". */
  lockText?: string;
  /** The scoring rules' "i". */
  scoringInfo?: ReactNode;
  /** The tiebreaker form, under the picks. */
  tiebreak?: ReactNode;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<number | null>(null);
  const [seedFilter, setSeedFilter] = useState<number | null>(null);
  const [pod, setPod] = useState<number | null>(null);
  const saved = useRef<string[]>(initial);
  const latest = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const slotOf = new Map(field.map((t, i) => [t?.id ?? "", i]));
  const slots = picked.map((id) => slotOf.get(id)).filter((x): x is number => x !== undefined);
  const seedTotal = slots.reduce((t, s) => t + seedAt(s), 0);
  const problem = picksError(slots, settings);
  const firstWin = (slot: number) => winPoints(settings.scoring, 1, seedAt(slot));

  // Each tap saves on its own (in order); a set that breaks a rule waits for a fix.
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    setError(null);
    const bad = picksError(next.map((x) => slotOf.get(x)!).filter((x) => x !== undefined), settings);
    if (bad) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    const n = ++latest.current;
    chain.current = chain.current.then(async () => {
      const r = await save(next).catch(() => ({ error: "That didn't save. Try again." }));
      if (r.error) {
        setError(r.error);
        setStatus("error");
        if (n === latest.current) setPicked(saved.current);
      } else {
        saved.current = next;
        if (n === latest.current) setStatus("saved");
      }
    });
  };

  // Each region's teams in seed order (1 through 16), filtered.
  const byRegion = regions
    .map((name, r) => ({
      r,
      name,
      teams: Array.from({ length: 16 }, (_, i) => r * 16 + i)
        .filter((slot) => seedFilter === null || seedAt(slot) === seedFilter)
        .map((slot) => ({ slot, team: field[slot] }))
        .sort((a, b) => seedAt(a.slot) - seedAt(b.slot)),
    }))
    .filter((reg) => regionFilter === null || reg.r === regionFilter);

  // The picks so far, best seed first, with an open spot for each one still to make.
  const mine = [...slots].sort((a, b) => seedAt(a) - seedAt(b));
  const myPicks = (
    <ul className="divide-y divide-line border-y border-line">
      {mine.map((slot) => {
        const t = field[slot]!;
        return (
          <li key={t.id} className="flex h-10 items-center gap-2 text-sm">
            <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-muted">{seedAt(slot)}</span>
            <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-5 shrink-0" />
            <FitText min={10} className="min-w-0 flex-1 font-semibold">{nameOf(t)}</FitText>
            <span className="shrink-0 text-[11px] text-muted">{regions[Math.floor(slot / 16)]}</span>
            <button type="button" onClick={() => toggle(t.id)} aria-label={`Drop ${nameOf(t)}`} className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-lg leading-none text-muted hover:bg-hover hover:text-ink">
              ×
            </button>
          </li>
        );
      })}
      {Array.from({ length: Math.max(0, settings.picks - mine.length) }, (_, i) => (
        <li key={`open${i}`} className="flex h-10 items-center gap-2 text-sm text-faint">
          <span className="w-6 text-center text-xs">–</span> Open pick
        </li>
      ))}
    </ul>
  );
  const statusText =
    status === "saving" ? "Saving…" : status === "error" ? (error ?? "Not saved") : problem ? problem : status === "saved" ? (
      <>
        <CheckIcon className="size-3.5 text-win" /> Saved
      </>
    ) : null;

  return (
    <div data-wide className="pb-16 lg:pb-14">
      <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6 min-[1600px]:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Desktop: the picks so far, kept in view. */}
        <aside aria-label="My picks" className="hidden lg:sticky lg:top-4 lg:block">
          <h2 className="mb-1 text-lg font-extrabold tracking-[-0.03em]">{forName ? "Their picks" : "My Picks"}</h2>
          {myPicks}
          {tiebreak && <div className="mt-4">{tiebreak}</div>}
        </aside>

        <div className="min-w-0">
          {/* How far along, when it locks, the scoring and the seed total. */}
          <section className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border-2 border-accent bg-surface px-4 py-2.5">
            <span className="text-xl font-extrabold tabular-nums tracking-[-0.02em] sm:text-2xl">
              {picked.length} <span className="text-muted">of {settings.picks} picked</span>
            </span>
            <span className="text-sm text-muted tabular-nums">
              Seeds total {seedTotal}
              {settings.limits.min_seed_total !== null && ` (at least ${settings.limits.min_seed_total})`}
            </span>
            {lockText && <span className="text-sm text-muted">{lockText}</span>}
            {scoringInfo && <span className="inline-flex items-center gap-1 text-sm text-muted">{scoringInfo} Scoring</span>}
          </section>
          {tiebreak && <div className="mb-4 lg:hidden">{tiebreak}</div>}
          {/* Filters: a region, a seed line, or both. */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setRegionFilter(null)} className={chipClass(regionFilter === null, "cursor-pointer", "sm")}>All regions</button>
            {regions.map((name, r) => (
              <button key={name} type="button" onClick={() => setRegionFilter(regionFilter === r ? null : r)} className={chipClass(regionFilter === r, "cursor-pointer", "sm")}>
                {name}
              </button>
            ))}
            <select
              aria-label="Seed line"
              value={seedFilter ?? ""}
              onChange={(e) => setSeedFilter(e.target.value ? Number(e.target.value) : null)}
              className="h-7 cursor-pointer rounded-full bg-surface px-2.5 text-xs font-medium text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="">All seeds</option>
              {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} seeds</option>
              ))}
            </select>
            {(regionFilter !== null || seedFilter !== null) && (
              <button type="button" onClick={() => (setRegionFilter(null), setSeedFilter(null))} className="cursor-pointer rounded-full px-2 text-xs font-medium text-accent hover:bg-hover">
                Clear
              </button>
            )}
          </div>
          <FitText min={9} className="mb-2 block text-sm text-muted">
            Tap a team to see its pod of the bracket. Add picks it; the number is its first win&apos;s points.
          </FitText>

          <div className={`grid gap-4 ${byRegion.length > 1 ? "sm:grid-cols-2" : ""} ${byRegion.length > 2 ? "2xl:grid-cols-4" : ""} ${seedFilter !== null && byRegion.length > 1 ? "2xl:grid-cols-4" : ""}`}>
            {byRegion.map((reg) => (
              <section key={reg.name} className="min-w-0">
                <h3 className="mb-1 flex items-baseline justify-between border-b-2 border-line pb-1 text-sm font-bold">
                  {reg.name}
                  <span className="text-xs font-normal text-muted tabular-nums">{reg.teams.filter((t) => t.team && picked.includes(t.team.id)).length} picked</span>
                </h3>
                <ul className="space-y-1">
                  {reg.teams.map(({ slot, team }) => {
                    if (!team) {
                      return (
                        <li key={slot} className="flex h-10 items-center gap-2 rounded-lg px-2 text-sm text-faint">
                          <span className="w-6 text-center text-xs font-semibold tabular-nums">{seedAt(slot)}</span> To be set
                        </li>
                      );
                    }
                    const on = picked.includes(team.id);
                    const blocked = blockedReason(slot, slots, settings);
                    return (
                      <li key={slot} className={`flex h-10 items-center gap-1 rounded-lg pr-1 transition ${on ? "bg-accent/15 ring-2 ring-accent" : "bg-surface"} ${!on && blocked ? "opacity-45" : ""}`}>
                        {/* The team: opens its pod of the bracket. */}
                        <button type="button" onClick={() => setPod(slot)} className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 text-left hover:bg-hover" aria-label={`${nameOf(team)}: see its pod`}>
                          <span className={`w-6 shrink-0 text-center text-xs font-bold tabular-nums ${on ? "text-accent" : "text-muted"}`}>{seedAt(slot)}</span>
                          <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-6 shrink-0 dark:rounded-full dark:bg-white/90 dark:p-0.5" />
                          <FitText min={10} className={`min-w-0 flex-1 text-sm font-semibold ${on ? "text-accent" : "text-ink"}`}>{nameOf(team)}</FitText>
                        </button>
                        {/* Add or drop it. */}
                        <button
                          type="button"
                          onClick={() => toggle(team.id)}
                          disabled={!on && Boolean(blocked)}
                          aria-pressed={on}
                          title={blocked ?? (on ? "Drop" : "Add")}
                          aria-label={`${on ? "Drop" : "Add"} ${nameOf(team)}`}
                          className={`flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums transition disabled:cursor-not-allowed ${
                            on ? "bg-accent text-white hover:brightness-110" : "bg-bg text-ink ring-1 ring-line hover:ring-accent"
                          }`}
                        >
                          {on ? <CheckIcon className="size-3.5" /> : <span aria-hidden>+</span>}
                          {firstWin(slot)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>

      {/* A bar fixed along the bottom, as on every pool's My Picks: the count and save status. On
          phones the View My Picks tab sits on its top edge and opens the picks drawer. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-accent bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="flex h-10 items-center justify-between gap-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] text-sm">
          <span className="shrink-0 font-semibold tabular-nums">
            {picked.length} <span className="font-normal text-muted">of {settings.picks} picked{forName ? ` for ${forName}` : ""}</span>
            <span className="ml-3 hidden font-normal text-muted sm:inline">Seeds {seedTotal}</span>
          </span>
          <span className={`flex min-w-0 items-center gap-1 truncate text-xs ${status === "error" || (problem && status !== "saving") ? "font-semibold text-loss" : "text-muted"}`}>{statusText}</span>
        </div>
      </div>
      {pod !== null && <PodDialog slot={pod} field={field} regions={regions} picked={picked} settings={settings} onToggle={toggle} blocked={(sl) => blockedReason(sl, slots, settings)} onClose={() => setPod(null)} />}
      <GridPanelDrawer title="My Picks" tabId="pickx-picks-button" tabClassName="lg:hidden !bottom-[calc(2.5rem+2px+env(safe-area-inset-bottom))] !pb-1.5">
        <p className="mb-2 text-sm text-muted tabular-nums">
          {picked.length} of {settings.picks} picked · seeds total {seedTotal}
        </p>
        {myPicks}
      </GridPanelDrawer>
    </div>
  );
}

/**
 * A team's pod: the four teams whose two First Round games meet in the Second Round, then the
 * pod its winner meets in the Sweet 16, and what the team's wins would be worth round by round.
 */
function PodDialog({ slot, field, regions, picked, settings, onToggle, blocked, onClose }: {
  slot: number;
  field: (Team | null)[];
  regions: string[];
  picked: string[];
  settings: PickXSettings;
  onToggle: (id: string) => void;
  blocked: (slot: number) => string | null;
  onClose: () => void;
}) {
  const team = field[slot]!;
  const base = Math.floor(slot / 4) * 4;
  const games = [[base, base + 1], [base + 2, base + 3]];
  const next = (Math.floor(slot / 4) ^ 1) * 4;
  const on = picked.includes(team.id);
  const why = on ? null : blocked(slot);
  let running = 0;
  const path = ROUNDS.map((r) => ({ r, pts: winPoints(settings.scoring, r.round, seedAt(slot)), total: (running += winPoints(settings.scoring, r.round, seedAt(slot))) }));
  const line = (sl: number) => {
    const t = field[sl];
    const mine = !!t && picked.includes(t.id);
    return (
      <div className={`flex h-8 items-center gap-2 px-2 text-sm ${sl === slot ? "bg-accent/10 font-bold" : ""}`}>
        <span className="w-5 shrink-0 text-right text-xs font-bold tabular-nums text-muted">{seedAt(sl)}</span>
        {t ? <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-5 shrink-0" /> : <span className="size-5 shrink-0" />}
        <FitText min={10} className={`min-w-0 flex-1 ${mine ? "text-accent" : ""}`}>{t ? nameOf(t) : "To be set"}</FitText>
        <span className="shrink-0 text-xs tabular-nums text-muted">+{winPoints(settings.scoring, 1, seedAt(sl))}</span>
      </div>
    );
  };
  return (
    <Shell
      label={`${nameOf(team)}: pod`}
      onClose={onClose}
      header={
        <div className="flex items-center gap-3">
          <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-12 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold"><FitText min={12}>{nameOf(team)}</FitText></h2>
            <p className="text-xs text-muted">{seedAt(slot)} seed · {regions[Math.floor(slot / 16)]}</p>
          </div>
        </div>
      }
    >
      <div className="mt-4">
        <div className="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Its pod · First and Second Rounds</div>
        {/* The two First Round games, bracketed into the Second Round. */}
        <div className="grid grid-cols-[minmax(0,1fr)_1.25rem_6.5rem] items-center">
          <div className="space-y-2">
            {games.map((g) => (
              <div key={g[0]} className="overflow-hidden rounded-md border border-line">
                {line(g[0])}
                <div className="border-t border-line" />
                {line(g[1])}
              </div>
            ))}
          </div>
          <div className="h-[calc(50%+1rem)] border-y border-r border-line" aria-hidden />
          <div className="pl-2 text-xs text-muted">Second Round: the two winners</div>
        </div>
        <p className="mt-3 text-xs text-muted">
          <span className="font-semibold text-ink">Sweet 16:</span> the winner meets the{" "}
          {[0, 1, 2, 3].map((i) => field[next + i]).filter(Boolean).map((t, i, all) => (
            <span key={t!.id}>
              {seedAt(next + [0, 1, 2, 3].find((j) => field[next + j]?.id === t!.id)!)} {nameOf(t!)}
              {i < all.length - 1 ? " / " : ""}
            </span>
          ))}{" "}
          pod.
        </p>

        <div className="mt-4 mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">If {nameOf(team)} keeps winning</div>
        <div className="grid grid-cols-6 gap-1 text-center text-xs">
          {path.map(({ r, pts, total }) => (
            <div key={r.round} className="rounded-md bg-surface px-1 py-1.5">
              <div className="text-[10px] font-semibold text-muted">{r.short}</div>
              <div className="font-bold tabular-nums">+{pts}</div>
              <div className="text-[10px] tabular-nums text-muted">{total}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          {why && <span className="text-xs text-loss">{why}</span>}
          <button
            type="button"
            onClick={() => onToggle(team.id)}
            disabled={Boolean(why)}
            className={`h-9 cursor-pointer rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${on ? "bg-surface text-ink hover:bg-hover" : "bg-accent text-white hover:brightness-110"}`}
          >
            {on ? "Drop from my picks" : "Add to my picks"}
          </button>
        </div>
      </div>
    </Shell>
  );
}
