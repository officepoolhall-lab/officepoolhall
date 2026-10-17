"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { SettingsFields } from "@/components/SettingsFields";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { PRESETS, type PoolSettings, type PresetKey } from "@/lib/poolSettings";
import { createPool } from "./actions";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function NewPoolForm({ defaultSeason }: { defaultSeason: number }) {
  const [preset, setPreset] = useState<PresetKey>("ncaab_confidence");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <ActionForm action={createPool} className="space-y-6">
      {(pending) => (
        <>
          <Card className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
                <button
                  key={key} type="button" onClick={() => setPreset(key)}
                  className={`min-h-11 rounded-lg border p-3 text-left text-sm ${preset === key ? "border-brass bg-brass/15 font-semibold" : "border-border"}`}
                >
                  {PRESETS[key].label}
                </button>
              ))}
            </div>
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
                <input name="season" type="number" required className={inputClass} defaultValue={defaultSeason} />
              </Field>
              <Field label="Entry fee">
                <input name="entry_fee" type="number" min={0} step={1} className={inputClass} defaultValue={0} />
              </Field>
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 font-display text-xl font-bold uppercase">Rules</h2>
            <SettingsFields key={preset} initial={PRESETS[preset].settings as PoolSettings} />
          </Card>
          <Button className="w-full" disabled={pending}>{pending ? "Creating…" : "Create pool"}</Button>
        </>
      )}
    </ActionForm>
  );
}
