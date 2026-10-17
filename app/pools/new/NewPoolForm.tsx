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

export function NewPoolForm({ defaultSeason }: { defaultSeason: number }) {
  const [preset, setPreset] = useState<PresetKey>("ncaab_confidence");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <ActionForm action={createPool} className="space-y-6">
      {/* Presets sit on the page as Cell-style tiles; the fields below live in panels. */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Pool type">
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
          <button
            key={key} type="button" onClick={() => setPreset(key)} aria-pressed={preset === key}
            className={`flex min-h-14 items-center rounded-[10px] px-3 py-2 text-left text-[15px] font-medium transition ${
              preset === key ? "bg-accent/15 text-accent ring-1 ring-accent" : "bg-surface text-ink hover:bg-hover"
            }`}
          >
            {PRESETS[key].label}
          </button>
        ))}
      </div>
      <Panel className={`space-y-4 p-4 ${panelFields}`}>
        <input type="hidden" name="sport" value={PRESETS[preset].sport} />
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
          <Field label="Season (start year)">
            <input name="season" type="number" required className={`${inputClass} tabular-nums`} defaultValue={defaultSeason} />
          </Field>
          <Field label="Entry fee">
            <input name="entry_fee" type="number" min={0} step={1} className={`${inputClass} tabular-nums`} defaultValue={0} />
          </Field>
        </div>
      </Panel>
      <Panel className={`p-4 ${panelFields}`}>
        <SectionLabel className="mb-3">Rules</SectionLabel>
        <SettingsFields key={preset} initial={PRESETS[preset].settings as PoolSettings} />
      </Panel>
      <SubmitButton className="w-full" pending="Creating…">Create pool</SubmitButton>
    </ActionForm>
  );
}
