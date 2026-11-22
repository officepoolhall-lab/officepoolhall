"use client";

import { useState, useTransition } from "react";
import { TeamLogo, buttonClass } from "@/components/ui";
import { blockedReason, picksError, seedAt, type PickXSettings } from "@/lib/pickx";

type Team = { id: string; name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null };

/**
 * Choose the entry's teams from the tournament field, region by region in seed order. Teams that
 * would break a rule are dimmed with the reason; the bar at the bottom shows the count and seed
 * total and saves.
 */
export function PickXPicker({
  field,
  regions,
  initial,
  settings,
  save,
  forName,
}: {
  /** 64 slots (region * 16 + bracket position); null where the commissioner hasn't set a team. */
  field: (Team | null)[];
  regions: string[];
  initial: string[];
  settings: PickXSettings;
  save: (teamIds: string[]) => Promise<{ error?: string }>;
  /** The commissioner picking for someone. */
  forName?: string;
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [saved, setSaved] = useState<string[]>(initial);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, start] = useTransition();
  const slotOf = new Map(field.map((t, i) => [t?.id ?? "", i]));
  const slots = picked.map((id) => slotOf.get(id)!).filter((x) => x !== undefined);
  const seedTotal = slots.reduce((t, s) => t + seedAt(s), 0);
  const problem = picksError(slots, settings);
  const dirty = JSON.stringify([...picked].sort()) !== JSON.stringify([...saved].sort());

  const toggle = (id: string) => {
    setMessage(null);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const onSave = () =>
    start(async () => {
      const r = await save(picked);
      if (r.error) setMessage({ error: r.error });
      else {
        setSaved(picked);
        setMessage({ ok: picked.length === settings.picks ? "Your picks are in." : `Saved ${picked.length} of ${settings.picks}.` });
      }
    });

  // Each region's teams in seed order (1 through 16).
  const byRegion = regions.map((name, r) => ({
    name,
    teams: Array.from({ length: 16 }, (_, i) => r * 16 + i)
      .map((slot) => ({ slot, team: field[slot] }))
      .sort((a, b) => seedAt(a.slot) - seedAt(b.slot)),
  }));

  return (
    <div className="pb-24">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {byRegion.map((reg) => (
          <section key={reg.name} className="rounded-2xl bg-surface p-3">
            <h3 className="mb-2 px-1 text-sm font-bold text-ink">
              {reg.name} <span className="font-normal text-muted">· {reg.teams.filter((t) => t.team && picked.includes(t.team.id)).length} picked</span>
            </h3>
            <ul className="space-y-1">
              {reg.teams.map(({ slot, team }) => {
                if (!team) {
                  return (
                    <li key={slot} className="flex h-11 items-center gap-2 rounded-xl px-2 text-sm text-faint">
                      <span className="w-6 text-center text-xs font-semibold tabular-nums">{seedAt(slot)}</span> To be set
                    </li>
                  );
                }
                const on = picked.includes(team.id);
                const blocked = blockedReason(slot, slots, settings);
                return (
                  <li key={slot}>
                    <button
                      type="button"
                      onClick={() => toggle(team.id)}
                      disabled={!on && Boolean(blocked)}
                      aria-pressed={on}
                      title={blocked ?? undefined}
                      className={`flex h-11 w-full items-center gap-2 rounded-xl px-2 text-left transition disabled:cursor-not-allowed ${
                        on ? "bg-accent/15 ring-2 ring-accent" : blocked ? "opacity-40" : "bg-bg ring-1 ring-line hover:ring-accent/50"
                      }`}
                    >
                      <span className={`w-6 shrink-0 text-center text-xs font-bold tabular-nums ${on ? "text-accent" : "text-muted"}`}>{seedAt(slot)}</span>
                      <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-6" />
                      <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${on ? "text-accent" : "text-ink"}`}>{team.short_name ?? team.name}</span>
                      {on && (
                        <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-accent">
                          <path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Count, seed total and Save, always in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 xl:max-w-6xl 2xl:max-w-7xl">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink tabular-nums">
              {picked.length} of {settings.picks} teams{forName ? ` for ${forName}` : ""}
              <span className="ml-2 text-sm font-normal text-muted">
                Seeds total {seedTotal}
                {settings.limits.min_seed_total !== null && ` (need ${settings.limits.min_seed_total})`}
              </span>
            </div>
            {(message?.error || problem) && <div className="text-xs font-semibold text-loss">{message?.error ?? problem}</div>}
            {message?.ok && !dirty && <div className="text-xs font-semibold text-win">{message.ok}</div>}
          </div>
          <button type="button" onClick={onSave} disabled={pending || !dirty || Boolean(problem)} className={buttonClass("accent", "disabled:opacity-40")}>
            {pending ? "Saving…" : "Save picks"}
          </button>
        </div>
      </div>
    </div>
  );
}
