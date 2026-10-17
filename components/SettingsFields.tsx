"use client";

import { useState } from "react";
import { evenTiers, type PoolSettings } from "@/lib/poolSettings";
import { Field, inputClass } from "./ui";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles"];
const BOOKMAKERS = ["draftkings", "fanduel", "betmgm", "williamhill_us", "espnbet", "betrivers"];

/**
 * Editable pool settings. Serializes to a hidden `settings` input (JSON) that the
 * server action validates with zod. `lockedCore` disables fields that can't change
 * once a week has opened.
 */
export function SettingsFields({ initial, lockedCore = false }: { initial: PoolSettings; lockedCore?: boolean }) {
  const [s, setS] = useState<PoolSettings>(initial);
  const set = (patch: Partial<PoolSettings>) => setS((prev) => ({ ...prev, ...patch }));
  const tierTotal = s.confidence?.tiers.reduce((n, t) => n + t.count, 0) ?? 0;
  const value: PoolSettings = { ...s, visibility: { show_picks_after: s.lock.mode === "weekly" ? "lock" : "game_start" } };

  return (
    <div className="space-y-5">
      <input type="hidden" name="settings" value={JSON.stringify(value)} />
      {lockedCore && (
        <p className="rounded-lg bg-raised p-3 text-sm text-muted">
          A week has opened, so pick type, pick count, and confidence tiers are locked for the season.
        </p>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={lockedCore}>
        <Field label="Pick type">
          <select className={inputClass} value={s.pick_type} onChange={(e) => set({ pick_type: e.target.value as PoolSettings["pick_type"] })}>
            <option value="straight_up">Straight up (pick the winner)</option>
            <option value="ats">Against the spread</option>
          </select>
        </Field>
        <Field label="Picks per week">
          <input
            type="number" min={1} max={100} className={inputClass} value={s.picks_per_slate}
            onChange={(e) => {
              const n = Number(e.target.value);
              set({ picks_per_slate: n, confidence: s.confidence ? { tiers: evenTiers(n, s.confidence.tiers.map((t) => t.points)) } : null });
            }}
          />
        </Field>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox" className="size-5 accent-[var(--felt)]" checked={Boolean(s.confidence)}
            onChange={(e) => set({ confidence: e.target.checked ? { tiers: evenTiers(s.picks_per_slate) } : null })}
          />
          <span className="text-sm font-medium">Confidence points (assign a point value to each pick)</span>
        </label>
        {s.confidence && (
          <div className="sm:col-span-2">
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium">Tiers</span>
              <span className={tierTotal === s.picks_per_slate ? "text-muted" : "text-loss"}>
                {tierTotal} of {s.picks_per_slate} picks
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {s.confidence.tiers.map((t, i) => (
                <div key={i} className="rounded-lg border border-border p-2 text-center">
                  <div className="font-display text-2xl font-bold">{t.points}</div>
                  <input
                    type="number" min={0} aria-label={`How many ${t.points}s`} className="w-full rounded border border-border text-center tabular-nums"
                    value={t.count}
                    onChange={(e) => {
                      const tiers = s.confidence!.tiers.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x));
                      set({ confidence: { tiers } });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Players must make" hint="Partial weeks are always saved; unpicked slots score 0.">
          <select className={inputClass} value={s.picks_mode} onChange={(e) => set({ picks_mode: e.target.value as PoolSettings["picks_mode"] })}>
            <option value="exact">Exactly {s.picks_per_slate} picks</option>
            <option value="max">Up to {s.picks_per_slate} picks</option>
          </select>
        </Field>
        {!s.confidence && (
          <div className="grid grid-cols-3 gap-2">
            {(["win", "push", "loss"] as const).map((k) => (
              <Field key={k} label={`Pts / ${k}`}>
                <input
                  type="number" step={0.5} className={inputClass} value={s.scoring[k]}
                  onChange={(e) => set({ scoring: { ...s.scoring, [k]: Number(e.target.value) } })}
                />
              </Field>
            ))}
          </div>
        )}

        <Field label="Pick lock">
          <select
            className={inputClass} value={s.lock.mode}
            onChange={(e) =>
              set({ lock: e.target.value === "weekly" ? { mode: "weekly", weekly: s.lock.weekly ?? { weekday: 2, time: "19:00" } } : { mode: "per_game" } })
            }
          >
            <option value="per_game">Each game locks at its start</option>
            <option value="weekly">One weekly deadline</option>
          </select>
        </Field>
        {s.lock.mode === "weekly" && s.lock.weekly && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Deadline day">
              <select
                className={inputClass} value={s.lock.weekly.weekday}
                onChange={(e) => set({ lock: { mode: "weekly", weekly: { ...s.lock.weekly!, weekday: Number(e.target.value) as 0 } } })}
              >
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </Field>
            <Field label="Time">
              <input
                type="time" className={inputClass} value={s.lock.weekly.time}
                onChange={(e) => set({ lock: { mode: "weekly", weekly: { ...s.lock.weekly!, time: e.target.value } } })}
              />
            </Field>
          </div>
        )}

        <Field label="Time zone">
          <select className={inputClass} value={s.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace("America/", "").replace("_", " ")}</option>)}
          </select>
        </Field>
        <Field label="Week starts" hint={`${s.window.length_days}-day weeks, from midnight`}>
          <select
            className={inputClass} value={s.window.start_weekday}
            onChange={(e) => set({ window: { ...s.window, start_weekday: Number(e.target.value) } })}
          >
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </Field>

        <Field label="Line source" hint="One sportsbook is the source of truth for spreads.">
          <select className={inputClass} value={s.lines.bookmaker} onChange={(e) => set({ lines: { ...s.lines, bookmaker: e.target.value } })}>
            {BOOKMAKERS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        {s.pick_type === "ats" && (
          <label className="flex items-center gap-2 self-end pb-3">
            <input
              type="checkbox" className="size-5 accent-[var(--felt)]" checked={s.lines.force_half_point}
              onChange={(e) => set({ lines: { ...s.lines, force_half_point: e.target.checked } })}
            />
            <span className="text-sm">Add a half point to whole-number spreads (no pushes)</span>
          </label>
        )}
      </div>
    </div>
  );
}
