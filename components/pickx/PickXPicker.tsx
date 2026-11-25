"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { CheckIcon, TeamLogo, chipClass } from "@/components/ui";
import { Shell } from "@/components/ProfileDialogs";
import { FitText } from "@/components/FitText";
import { GridPanelDrawer } from "@/components/GridPanelDrawer";
import { SEED_ORDER } from "@/lib/bracket";
import { blockedReason, picksError, seedAt, type PickXSettings } from "@/lib/pickx";

type Team = { id: string; name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null };
const nameOf = (t: Team) => t.short_name ?? t.name;

/**
 * Choose the entry's teams from the tournament field, region by region in seed order, like
 * Playoff Fantasy's My Team; teams that would break a rule are dimmed with the reason. Filter by
 * region or seed line; tap a team for its pod of the bracket. Picks save together, with the
 * tiebreaker, and only as a full set: Save stays off until every team is picked and (when the
 * pool uses one) the tiebreaker is filled in. The picks so far sit on the left (desktop) or in a drawer from the footer bar
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
  save: (teamIds: string[], tiebreak: number | null) => Promise<{ error?: string }>;
  /** The commissioner picking for someone. */
  forName?: string;
  /** "Locks Thu, Mar 19 · 11:15 AM". */
  lockText?: string;
  /** The scoring rules' "i". */
  scoringInfo?: ReactNode;
  /** The pool's tiebreaker (the title game's total points): the saved guess; null when the pool has no tiebreaker. */
  tiebreak: { initial: number | null } | null;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [tb, setTb] = useState<string>(tiebreak?.initial != null ? String(tiebreak.initial) : "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  // One region at a time (the first to start), or every team by seed line.
  const [view, setView] = useState<number | "seeds">(0);
  const [pod, setPod] = useState<number | null>(null);
  const saved = useRef({ picks: [...initial].sort().join(","), tb: tiebreak?.initial != null ? String(tiebreak.initial) : "" });

  const slotOf = new Map(field.map((t, i) => [t?.id ?? "", i]));
  const slots = picked.map((id) => slotOf.get(id)).filter((x): x is number => x !== undefined);
  const seedTotal = slots.reduce((t, s) => t + seedAt(s), 0);
  const problem = picksError(slots, settings);

  const toggle = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setError(null);
    setStatus("idle");
  };

  // What's holding up Save: teams still to pick, a broken rule, the tiebreaker.
  const tbValue = /^\d{1,3}$/.test(tb.trim()) ? Number(tb.trim()) : null;
  const dirty = [...picked].sort().join(",") !== saved.current.picks || tb.trim() !== saved.current.tb;
  const missing = settings.picks - picked.length;
  const blocker =
    missing > 0
      ? `${missing} more to pick`
      : problem
        ? problem
        : tiebreak && tbValue === null
          ? "Tiebreaker needed"
          : null;
  const canSave = dirty && !blocker && !saving;
  const onSave = () =>
    startSave(async () => {
      const r = await save(picked, tiebreak ? tbValue : null).catch(() => ({ error: "That didn't save. Try again." }));
      if (r.error) {
        setError(r.error);
        setStatus("error");
      } else {
        saved.current = { picks: [...picked].sort().join(","), tb: tb.trim() };
        setStatus("saved");
      }
    });
  // Leaving with changes that aren't saved: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // The tiebreaker: the title game's total points, saved with the picks.
  const tiebreakBox = tiebreak && (
    <label className="block rounded-xl border-2 border-accent bg-surface px-3 py-2.5">
      <span className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Tiebreaker</span>
          <span className="block text-xs text-muted">Total points scored in the national championship game</span>
        </span>
        <input
          type="number" min={0} max={999} inputMode="numeric" placeholder="141" aria-label="Tiebreaker: championship game total points" value={tb}
          onChange={(e) => (setTb(e.target.value), setStatus("idle"))}
          className={`h-10 w-20 shrink-0 rounded-[10px] bg-bg px-2 text-center text-[17px] font-bold tabular-nums outline-none ring-2 focus:ring-accent ${tbValue === null ? "ring-line" : "ring-accent/40"}`}
        />
      </span>
      {tbValue === null && <span className="mt-1 block text-xs font-semibold text-accent">Required to save your picks.</span>}
    </label>
  );
  const saveButton = (className = "") => (
    <button
      type="button"
      onClick={onSave}
      disabled={!canSave}
      className={`flex shrink-0 cursor-pointer items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold whitespace-nowrap text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {saving ? "Saving…" : "Save picks"}
    </button>
  );

  // The teams shown: a region's 16 in seed order, or all 64 grouped by seed line (1 seeds, 2 seeds …).
  const groups =
    view === "seeds"
      ? Array.from({ length: 16 }, (_, i) => i + 1).map((seed) => ({
          name: `${seed} seeds`,
          teams: [0, 1, 2, 3].map((r) => r * 16 + SEED_ORDER.indexOf(seed as (typeof SEED_ORDER)[number])).map((slot) => ({ slot, team: field[slot] })),
        }))
      : [
          {
            name: regions[view],
            teams: Array.from({ length: 16 }, (_, i) => view * 16 + i)
              .map((slot) => ({ slot, team: field[slot] }))
              .sort((a, b) => seedAt(a.slot) - seedAt(b.slot)),
          },
        ];

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
    status === "error" ? (error ?? "Not saved") : blocker && (dirty || missing > 0) ? blocker : dirty ? "Unsaved changes" : status === "saved" ? (
      <>
        <CheckIcon className="size-3.5 text-win" /> Saved
      </>
    ) : missing === 0 ? (
      <>
        <CheckIcon className="size-3.5 text-win" /> Picks in
      </>
    ) : null;
  const statusBad = status === "error" || (!!blocker && (dirty || missing > 0));

  return (
    <div data-wide className="pb-16 lg:pb-14">
      <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6 min-[1600px]:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Desktop: the picks so far, kept in view. */}
        <aside aria-label="My picks" className="hidden lg:sticky lg:top-4 lg:block">
          <h2 className="mb-1 text-lg font-extrabold tracking-[-0.03em]">{forName ? "Their picks" : "My Picks"}</h2>
          {myPicks}
          {tiebreakBox && <div className="mt-4">{tiebreakBox}</div>}
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
          {tiebreakBox && <div className="mb-4 lg:hidden">{tiebreakBox}</div>}
          {/* One region at a time, or Seeds: every team grouped by seed line. */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {regions.map((name, r) => (
              <button key={name} type="button" onClick={() => setView(r)} className={chipClass(view === r, "cursor-pointer", "sm")}>
                {name}
              </button>
            ))}
            <button type="button" onClick={() => setView("seeds")} className={chipClass(view === "seeds", "cursor-pointer", "sm")}>
              Seeds
            </button>
          </div>
          <FitText min={9} className="mb-2 block text-sm text-muted">
            Tap a team for its pod; tap + to pick it.
          </FitText>

          <div className={`grid gap-4 ${view === "seeds" ? "sm:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-4" : ""}`}>
            {groups.map((reg) => (
              <section key={reg.name} className="min-w-0">
                <h3 className="mb-1 flex items-baseline justify-between border-b-2 border-line pb-1 text-sm font-bold">
                  {reg.name}
                  <span className="text-xs font-normal text-muted tabular-nums">{reg.teams.filter((t) => t.team && picked.includes(t.team.id)).length} picked</span>
                </h3>
                {/* A region: two columns of eight on wider screens (1-8 seeds, then 9-16). */}
                <ul className={view === "seeds" ? "space-y-1" : "space-y-1 sm:grid sm:grid-flow-col sm:grid-rows-8 sm:gap-x-4 sm:gap-y-1 sm:space-y-0"}>
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
                          {view === "seeds" && <span className="shrink-0 text-[11px] text-muted">{regions[Math.floor(slot / 16)]}</span>}
                        </button>
                        {/* Add or drop it. */}
                        <button
                          type="button"
                          onClick={() => toggle(team.id)}
                          disabled={!on && Boolean(blocked)}
                          aria-pressed={on}
                          title={blocked ?? (on ? "Drop" : "Add")}
                          aria-label={`${on ? "Drop" : "Add"} ${nameOf(team)}`}
                          className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-base font-semibold transition disabled:cursor-not-allowed ${
                            on ? "bg-accent text-white hover:brightness-110" : "bg-bg text-ink ring-1 ring-line hover:ring-accent"
                          }`}
                        >
                          {on ? <CheckIcon className="size-4" /> : <span aria-hidden>+</span>}
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
          <span className="flex min-w-0 items-center gap-3">
            <span className={`flex min-w-0 items-center gap-1 truncate text-xs ${statusBad ? "font-semibold text-loss" : "text-muted"}`}>{statusText}</span>
            {saveButton("h-8")}
          </span>
        </div>
      </div>
      {pod !== null && <PodDialog slot={pod} field={field} regions={regions} picked={picked} settings={settings} onToggle={toggle} blocked={(sl) => blockedReason(sl, slots, settings)} onClose={() => setPod(null)} />}
      <GridPanelDrawer title="My Picks" tabId="pickx-picks-button" tabClassName="lg:hidden !bottom-[calc(2.5rem+2px+env(safe-area-inset-bottom))] !pb-1.5">
        <p className="mb-2 text-sm text-muted tabular-nums">
          {picked.length} of {settings.picks} picked · seeds total {seedTotal}
        </p>
        {myPicks}
        {tiebreakBox && <div className="mt-3">{tiebreakBox}</div>}
        <div className="mt-3 flex items-center gap-3">
          <span className={`min-w-0 flex-1 text-xs ${statusBad ? "font-semibold text-loss" : "text-muted"}`}>{statusText}</span>
          {saveButton("h-10")}
        </div>
      </GridPanelDrawer>
    </div>
  );
}

/**
 * A team's pod: the four teams whose two First Round games meet in the Second Round, then the
 * pod its winner meets in the Sweet 16.
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
  // Its half of the region: its pod (its First Round game and the one it meets in the Second
  // Round) and the other pod, whose winner it would meet in the Sweet 16.
  const half = Math.floor(slot / 8) * 8;
  const myPod = Math.floor(slot / 4) * 4;
  const games = [0, 1, 2, 3].map((i) => [half + 2 * i, half + 2 * i + 1]);
  const on = picked.includes(team.id);
  const why = on ? null : blocked(slot);
  const short = (sl: number) => field[sl]?.abbreviation ?? (field[sl] ? nameOf(field[sl]!) : "TBD");
  const line = (sl: number) => {
    const t = field[sl];
    const mine = !!t && picked.includes(t.id);
    return (
      <div className={`flex h-7 items-center gap-1.5 px-1.5 text-[13px] ${sl === slot ? "bg-accent/15 font-bold" : ""}`}>
        <span className="w-4 shrink-0 text-right text-[11px] font-bold tabular-nums text-muted">{seedAt(sl)}</span>
        {t ? <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-4 shrink-0" /> : <span className="size-4 shrink-0" />}
        <FitText min={9} className={`min-w-0 flex-1 ${mine ? "text-accent" : ""}`}>{t ? nameOf(t) : "To be set"}</FitText>
      </div>
    );
  };
  const later = (label: string, sub: string, ours: boolean) => (
    <div className={`rounded-md border px-1.5 py-1 text-[11px] leading-tight ${ours ? "border-accent" : "border-line"}`}>
      <div className="font-semibold text-ink">{label}</div>
      <div className="text-muted">{sub}</div>
    </div>
  );
  return (
    <Shell
      label={`${nameOf(team)}: its side of the bracket`}
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
        {/* The half of the region: four First Round games into two Second Round games into the Sweet 16. */}
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_5rem] gap-x-2 text-[10px] font-bold tracking-wide text-muted uppercase">
          <span>First Round</span>
          <span>Second Round</span>
          <span>Sweet 16</span>
        </div>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_5.5rem_5rem] gap-x-2">
          <div className="space-y-1.5">
            {games.map((g, i) => (
              <div key={g[0]} className={`overflow-hidden rounded-md border ${g[0] >= myPod && g[0] < myPod + 4 ? "border-accent/60" : "border-line"} ${i === 2 ? "mt-3" : ""}`}>
                {line(g[0])}
                <div className="border-t border-line" />
                {line(g[1])}
              </div>
            ))}
          </div>
          <div className="flex flex-col justify-around">
            {[0, 1].map((p) => {
              const s0 = half + 4 * p;
              return <div key={p}>{later(`${short(s0)}/${short(s0 + 1)}`, `vs ${short(s0 + 2)}/${short(s0 + 3)}`, s0 === myPod)}</div>;
            })}
          </div>
          <div className="flex flex-col justify-center">{later("Pod winners", "meet here", true)}</div>
        </div>
        <p className="mt-3 text-xs text-muted">
          {nameOf(team)}&apos;s pod is outlined in blue. The other four teams are who it could meet in the Sweet 16.
        </p>

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
