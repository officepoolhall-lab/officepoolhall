"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, TeamLogo, inputClass } from "@/components/ui";
import type { ActionState } from "@/components/ActionForm";

type Scoring = "third_place" | "semifinals" | "champion_only";
type Team = { id: string; name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null; conference: string | null };

const teamName = (t: Team) => t.short_name ?? t.name;
// Inputs share bg-surface with the panel, so inside panels they drop to the page background.
const panelInput = `${inputClass} !bg-bg`;

/**
 * Add or edit a tournament: name, the week it belongs to, when picks lock, how it's scored,
 * and its field (search the pool's teams, check each one in it). For a conference tournament,
 * "Fill from conference" adds every team in that conference, names it and sets champion-only
 * scoring in one step.
 */
export function TournamentForm({
  action,
  teams,
  weeks,
  initial,
  submitLabel,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  teams: Team[];
  /** Weeks to offer (published and upcoming), as [week, label]. */
  weeks: [number, string][];
  initial?: { name: string; week: number; lockLocal: string; scoring: Scoring; teamIds: string[] };
  submitLabel: string;
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initial?.teamIds ?? []));
  const [name, setName] = useState(initial?.name ?? "");
  const [scoring, setScoring] = useState<Scoring>(initial?.scoring ?? "third_place");
  const conferences = useMemo(() => [...new Set(teams.map((t) => t.conference).filter((c): c is string => Boolean(c)))].sort(), [teams]);
  const fillConference = (conf: string) => {
    if (!conf) return;
    setChosen((prev) => new Set([...prev, ...teams.filter((t) => t.conference === conf).map((t) => t.id)]));
    if (!name.trim()) setName(`${conf} Tournament`);
    setScoring("champion_only");
  };
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const q = query.trim().toLowerCase();
  const matches = q
    ? teams.filter((t) => [t.name, t.short_name, t.abbreviation, t.conference].some((v) => v?.toLowerCase().includes(q))).slice(0, 40)
    : [];
  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const field = [...chosen].map((id) => byId.get(id)).filter((t): t is Team => Boolean(t)).sort((a, b) => teamName(a).localeCompare(teamName(b)));

  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Tournament">
          <input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Maui Invitational" className={panelInput} />
        </Field>
        <Field label="Week">
          <select name="week" required defaultValue={initial?.week ?? weeks[0]?.[0]} className={panelInput}>
            {weeks.map(([w, label]) => (
              <option key={w} value={w}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Picks lock" hint="Its first tip-off (pool time).">
          <input name="lock_at" type="datetime-local" required defaultValue={initial?.lockLocal} className={`${panelInput} tabular-nums`} />
        </Field>
        <Field label="Scoring">
          <select name="scoring" value={scoring} onChange={(e) => setScoring(e.target.value as Scoring)} className={panelInput}>
            <option value="third_place">Champion 5 · Runner-up 3 · 3rd-place game 2/1</option>
            <option value="semifinals">Champion 5 · Runner-up 3 · Semifinal losers 1.5</option>
            <option value="champion_only">Champion 5 (conference tournaments)</option>
          </select>
        </Field>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium">Field</span>
          <span className="text-xs text-muted tabular-nums">{field.length} team{field.length === 1 ? "" : "s"}</span>
        </div>
        {/* The chosen teams; tap one to take it out. */}
        {field.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {field.map((t) => (
              <li key={t.id}>
                <input type="hidden" name="team" value={t.id} />
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent/15 px-2.5 text-sm font-medium text-accent ring-1 ring-accent"
                  aria-label={`Remove ${teamName(t)}`}
                >
                  <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-4" />
                  {teamName(t)} <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <select
            value=""
            onChange={(e) => fillConference(e.target.value)}
            aria-label="Fill the field from a conference"
            className={`${panelInput} !w-auto`}
          >
            <option value="">Fill from conference…</option>
            {conferences.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {field.length > 0 && (
            <button type="button" onClick={() => setChosen(new Set())} className="text-sm font-medium text-accent">
              Clear field
            </button>
          )}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search teams to add (name, abbreviation or conference)"
          className={panelInput}
          aria-label="Search teams"
        />
        {matches.length > 0 && (
          <ul className="mt-1 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {matches.map((t) => {
              const on = chosen.has(t.id);
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => toggle(t.id)} aria-pressed={on} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover">
                    <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-5" />
                    <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                    {t.conference && <span className="text-xs text-muted">{t.conference}</span>}
                    <span className={`text-xs font-semibold ${on ? "text-accent" : "text-muted"}`}>{on ? "In field" : "Add"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {q && matches.length === 0 && <p className="mt-1 text-sm text-muted">No team matches “{query}”.</p>}
      </div>

      <SubmitButton pending="Saving…" className="!px-5">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
