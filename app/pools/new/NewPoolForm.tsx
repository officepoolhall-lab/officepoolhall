"use client";

import { useState, type ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingsFields } from "@/components/SettingsFields";
import { OptionCards, SettingRow, SettingsSection, settingInput } from "@/components/SettingsUI";
import { SportIcon } from "@/components/SportIcon";
import { LEAGUES, TEMPLATE_FORMAT, findTemplate, isFormatTemplate, type CatalogLeague, type Template } from "@/lib/poolCatalog";
import { PRESETS, type PoolSettings, type PresetKey } from "@/lib/poolSettings";
import { PickXRulesFields } from "@/components/pickx/PickXRulesFields";
import { PICKX_DEFAULT } from "@/lib/pickx";
import { SurvivorRulesFields } from "@/components/survivor/SurvivorRulesFields";
import { SquaresRulesFields } from "@/components/squares/SquaresRulesFields";
import { PfRulesFields } from "@/components/playoff/PfRulesFields";
import { SURVIVOR_DEFAULT } from "@/lib/survivor";
import { SQUARES_DEFAULT } from "@/lib/squares";
import { PF_DEFAULT } from "@/lib/playoffFantasy";
import { createPool } from "./actions";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isPreset = (t: Template | null): t is PresetKey => !!t && t in PRESETS;

/** A numbered step: its number and title, then its content. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2.5 text-lg font-extrabold tracking-[-0.02em]">
        <span className="flex size-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white dark:text-black">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Start a pool: choose the sport, then the type of pool (the same choices as the landing page),
 * then name it and check the rules. Each type starts from a template; every rule can still be
 * changed until the first week opens.
 */
export function NewPoolForm({ defaultSeason, initial }: { defaultSeason: number; initial?: string }) {
  const start = findTemplate(initial);
  const [leagueId, setLeagueId] = useState<CatalogLeague["id"] | null>(start?.league.id ?? null);
  const [template, setTemplate] = useState<Template | null>(start?.type.template ?? null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [majorsScope, setMajorsScope] = useState("all");

  const league = LEAGUES.find((l) => l.id === leagueId) ?? null;
  const type = league?.types.find((t) => t.template === template) ?? null;
  const golf = template === "golf_tiers" || template === "golf_salary";
  const pickX = template === "ncaab_pickx";
  // Survivor, Squares and Playoff Fantasy: NFL pools with their own rules.
  const format = isFormatTemplate(template) ? TEMPLATE_FORMAT[template] : null;
  const year = new Date().getFullYear();

  return (
    <ActionForm action={createPool} className="space-y-8">
      <Step n={1} title="Choose a sport">
        <div role="radiogroup" aria-label="Sport" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LEAGUES.map((l) => {
            const on = l.id === leagueId;
            const ready = l.types.filter((t) => t.template).length;
            return (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setLeagueId(l.id);
                  // Keep the pool type only if it belongs to this sport.
                  if (!l.types.some((t) => t.template && t.template === template)) setTemplate(null);
                }}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition ${
                  on ? "bg-accent text-white ring-1 ring-accent dark:text-black" : "bg-surface text-ink hover:bg-hover"
                }`}
              >
                <SportIcon kind={l.kind} className={`size-6 shrink-0 ${on ? "" : "text-accent"}`} />
                <span className="min-w-0">
                  <span className="block text-lg font-extrabold leading-tight tracking-[-0.02em]">{l.label}</span>
                  <span className={`block truncate text-xs ${on ? "opacity-85" : "text-muted"}`}>
                    {ready} {ready === 1 ? "pool type" : "pool types"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Step>

      {league && (
        <Step n={2} title="Choose a pool type">
          <div role="radiogroup" aria-label="Pool type" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {league.types.map((t) => {
              const on = !!t.template && t.template === template;
              // Not ready to start from here yet: shown, but can't be chosen.
              if (!t.template) {
                return (
                  <div key={t.id} className="flex flex-col rounded-2xl bg-surface/60 p-4 opacity-70">
                    <span className="mb-2 self-start rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold text-muted">Coming soon</span>
                    <div className="whitespace-nowrap text-[17px] font-bold leading-tight text-ink">{t.name}</div>
                    <p className="mt-1.5 text-sm text-muted">{t.text}</p>
                  </div>
                );
              }
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTemplate(t.template!)}
                  className={`flex flex-col rounded-2xl p-4 text-left transition ${on ? "bg-accent/10 ring-2 ring-accent" : "bg-surface ring-1 ring-transparent hover:ring-accent/50"}`}
                >
                  <div className={`whitespace-nowrap text-[17px] font-bold leading-tight ${on ? "text-accent" : "text-ink"}`}>{t.name}</div>
                  <p className="mt-1.5 text-sm text-muted">{t.text}</p>
                </button>
              );
            })}
          </div>
        </Step>
      )}

      {type && (
        <>
          <Step n={3} title="Name your pool">
            <input type="hidden" name="sport" value={golf ? "pga" : pickX ? "ncaab" : format ? "nfl" : isPreset(template) ? PRESETS[template].sport : ""} />
            <SettingsSection title="Pool details" description="You can rename the pool and change the entry fee any time.">
              <SettingRow label="Pool name">
                <input
                  name="name" required aria-label="Pool name" className={`${settingInput} w-full sm:w-72`} value={name} placeholder={`${league!.label} ${type.name}`}
                  onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }}
                />
              </SettingRow>
              <SettingRow label="Web address" hint={`Your pool's link: officepoolhall…/p/${slug || "your-pool"}`}>
                <input name="slug" required aria-label="Web address" className={`${settingInput} w-full sm:w-72`} value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
              </SettingRow>
              <SettingRow label={golf ? "Year" : "Season"} hint={golf ? undefined : "The year the season starts."}>
                <input
                  key={golf ? `golf-${majorsScope === "event"}` : "team"} name="season" type="number" required aria-label="Season" className={`${settingInput} w-28 text-center tabular-nums`}
                  defaultValue={golf ? (majorsScope === "event" ? year : year + 1) : defaultSeason}
                />
              </SettingRow>
              <SettingRow label="Entry fee" hint="For your records; the site doesn't collect money.">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted">$</span>
                  <input name="entry_fee" type="number" min={0} step={1} aria-label="Entry fee" className={`${settingInput} w-28 text-center tabular-nums`} defaultValue={0} />
                </div>
              </SettingRow>
            </SettingsSection>
          </Step>

          <Step n={4} title="Set the rules">
            {golf && (
              <>
                <input type="hidden" name="majors_contest" value={template === "golf_salary" ? "salary" : "tiers"} />
                <input type="hidden" name="majors_scope" value={majorsScope} />
              </>
            )}
            {golf ? (
              <GolfOptions template={template!} scope={majorsScope} onScope={setMajorsScope} />
            ) : pickX ? (
              <>
                {/* The weekly rules don't apply to Pick X, but every college basketball pool carries them. */}
                <input type="hidden" name="settings" value={JSON.stringify(PRESETS.ncaab_pickem.settings)} />
                <PickXRulesFields initial={PICKX_DEFAULT} />
                <p className="mt-3 text-sm text-muted">After creating the pool, set the tournament field and the lock time on Commissioner → Bracket.</p>
              </>
            ) : format ? (
              <>
                {/* The weekly rules don't apply, but every football pool carries them (Survivor's weeks use them for its slates). */}
                <input type="hidden" name="settings" value={JSON.stringify(PRESETS.nfl_pickem.settings)} />
                <input type="hidden" name="format" value={format} />
                {format === "survivor" ? (
                  <SurvivorRulesFields initial={SURVIVOR_DEFAULT} />
                ) : format === "squares" ? (
                  <SquaresRulesFields initial={SQUARES_DEFAULT} />
                ) : (
                  <PfRulesFields initial={PF_DEFAULT} />
                )}
                <p className="mt-3 text-sm text-muted">
                  {format === "survivor"
                    ? "After creating the pool, publish each week's games on Commissioner → Slate."
                    : format === "squares"
                      ? "After creating the pool, set the teams and draw the numbers on Commissioner → Board."
                      : "After creating the pool, choose the playoff teams, load their players and set the lock time on the Commissioner pages."}
                </p>
              </>
            ) : isPreset(template) ? (
              <SettingsFields key={template} initial={PRESETS[template].settings as PoolSettings} />
            ) : null}
          </Step>

          <SubmitButton kind="accent" className="w-full" pending="Creating…">Create pool</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

/** Golf: which tournaments the pool covers. Tiers, salaries and scoring are set on the pool's Commissioner page afterwards. */
function GolfOptions({ template, scope, onScope }: { template: Template; scope: string; onScope: (v: string) => void }) {
  return (
    <SettingsSection title="Tournaments" description="Tiers, salaries and scoring can be adjusted on the pool's Commissioner page after it's created.">
      <SettingRow label="Covers" stack>
        <OptionCards
          ariaLabel="Tournaments"
          value={scope}
          onChange={onScope}
          options={[
            { value: "all", label: "All four majors", text: "Masters, PGA Championship, U.S. Open and The Open." },
            { value: "masters", label: "The Masters" },
            { value: "pga", label: "PGA Championship" },
            { value: "us_open", label: "U.S. Open" },
            { value: "open", label: "The Open Championship" },
            { value: "event", label: "Another PGA Tour event", text: "Any single tournament on the schedule." },
          ]}
        />
      </SettingRow>
      {scope === "event" && (
        <>
          <SettingRow label="Tournament name">
            <input name="event_name" required aria-label="Tournament name" className={`${settingInput} w-full sm:w-72`} placeholder="The RSM Classic" />
          </SettingRow>
          <SettingRow label="ESPN tournament id" hint="The number at the end of its ESPN leaderboard link (…/tournamentId/401850981).">
            <input name="event_espn_id" required inputMode="numeric" aria-label="ESPN tournament id" className={`${settingInput} w-40 tabular-nums`} />
          </SettingRow>
        </>
      )}
    </SettingsSection>
  );
}
