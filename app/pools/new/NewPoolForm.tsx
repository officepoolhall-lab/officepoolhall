"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingsFields } from "@/components/SettingsFields";
import { Field, inputClass, Panel, SectionLabel } from "@/components/ui";
import { PRESETS, type PoolSettings, type PresetKey } from "@/lib/poolSettings";
import { createPool } from "./actions";

// Inputs share bg-surface with the panel, so inside panels they drop to the page background.
const panelFields = "[&_input:not([type=checkbox])]:bg-bg [&_select]:bg-bg";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Choice = PresetKey | "pga_majors";

/** The templates, grouped by sport in the order the landing page lists them. */
const GROUPS: { label: string; keys: Choice[] }[] = [
  { label: "NFL", keys: ["nfl_ats", "nfl_pickem", "nfl_confidence"] },
  { label: "NCAAF", keys: ["ncaaf_ats", "ncaaf_pickem", "ncaaf_confidence"] },
  { label: "NCAAB", keys: ["ncaab_confidence", "ncaab_pickem"] },
  { label: "PGA", keys: ["pga_majors"] },
];

const isChoice = (v: unknown): v is Choice => typeof v === "string" && (v === "pga_majors" || v in PRESETS);

export function NewPoolForm({ defaultSeason, initial }: { defaultSeason: number; initial?: string }) {
  const [preset, setPreset] = useState<Choice>(isChoice(initial) ? initial : "ncaab_confidence");
  const golf = preset === "pga_majors";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [majorsScope, setMajorsScope] = useState("all");

  return (
    <ActionForm action={createPool} className="space-y-6">
      {/* Templates by sport, as Cell-style tiles; the fields below live in panels. Each one only
          fills in the settings, which can all be changed before the first week opens. */}
      <div className="space-y-4" role="group" aria-label="Pool type">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <SectionLabel>{g.label}</SectionLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.keys.map((key) => {
                const on = preset === key;
                return (
                  <button
                    key={key} type="button" onClick={() => setPreset(key)} aria-pressed={on}
                    className={`flex min-h-12 items-center rounded-[10px] px-3 py-2 text-left text-[15px] font-medium transition ${
                      on ? "bg-accent/15 text-accent ring-1 ring-accent" : "bg-surface text-ink hover:bg-hover"
                    }`}
                  >
                    {key === "pga_majors" ? "Majors / Tournament" : PRESETS[key].short}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Panel className={`space-y-4 p-4 ${panelFields}`}>
        <input type="hidden" name="sport" value={golf ? "pga" : PRESETS[preset].sport} />
        <Field label="Pool name">
          <input
            name="name" required className={inputClass} value={name} placeholder="Office Pool Hall NCAAB"
            onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
          />
        </Field>
        <Field label="URL name" hint={`officepoolhall…/p/${slug || "your-pool"}`}>
          <input name="slug" required className={inputClass} value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={golf ? (majorsScope === "event" ? "Year" : "Year of the majors") : "Season (start year)"}>
            <input
              key={golf ? `golf-${majorsScope === "event"}` : "college"} name="season" type="number" required className={`${inputClass} tabular-nums`}
              defaultValue={golf ? (majorsScope === "event" ? new Date().getFullYear() : 2027) : defaultSeason}
            />
          </Field>
          <Field label="Entry fee">
            <input name="entry_fee" type="number" min={0} step={1} className={`${inputClass} tabular-nums`} defaultValue={0} />
          </Field>
        </div>
      </Panel>
      {golf ? (
        // Golf majors: which majors and the contest type; tiers, salaries and scoring are set in
        // the pool's Admin afterwards.
        <Panel className={`grid gap-4 p-4 sm:grid-cols-2 ${panelFields}`}>
          <Field label="Majors">
            <select name="majors_scope" value={majorsScope} onChange={(e) => setMajorsScope(e.target.value)} className={inputClass}>
              <option value="all">All Majors</option>
              <option value="masters">Masters</option>
              <option value="pga">PGA Championship</option>
              <option value="us_open">US Open</option>
              <option value="open">Open Championship</option>
              <option value="event">Another PGA Tour event</option>
            </select>
          </Field>
          <Field label="Contest">
            <select name="majors_contest" defaultValue="tiers" className={inputClass}>
              <option value="tiers">Tiers</option>
              <option value="salary">Salary Cap</option>
            </select>
          </Field>
          {majorsScope === "event" && (
            <>
              <Field label="Tournament name">
                <input name="event_name" required className={inputClass} placeholder="The RSM Classic" />
              </Field>
              <Field label="ESPN tournament id" hint="The number at the end of its ESPN leaderboard link (…/tournamentId/401850981).">
                <input name="event_espn_id" required inputMode="numeric" className={`${inputClass} tabular-nums`} />
              </Field>
            </>
          )}
          <p className="text-xs text-muted sm:col-span-2">Tiers, salaries, scoring and standings are set in the pool&apos;s Admin after it&apos;s created.</p>
        </Panel>
      ) : (
        <Panel className={`p-4 ${panelFields}`}>
          <SectionLabel className="mb-3">Rules</SectionLabel>
          <SettingsFields key={preset} initial={PRESETS[preset].settings as PoolSettings} />
        </Panel>
      )}
      <SubmitButton className="w-full" pending="Creating…">Create pool</SubmitButton>
    </ActionForm>
  );
}
