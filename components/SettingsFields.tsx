"use client";

import { useState } from "react";
import { PRESETS, evenTiers, parseSegmentWeeks, type PoolSettings } from "@/lib/poolSettings";
import { Field, SectionLabel, inputClass } from "./ui";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles"];
const BOOKMAKERS = ["draftkings", "fanduel", "betmgm", "williamhill_us", "espnbet", "betrivers"];

// These fields always render inside a bg-surface panel, so inputs take the page color to stay visible.
const field = inputClass.replace("bg-surface", "bg-bg");
const checkbox = "size-5 shrink-0 accent-[var(--accent)]";

// Turning the upset bonus on starts from the guidelines' tiers; editing tiers isn't offered yet.
const DEFAULT_UPSET_TIERS = PRESETS.ncaab_confidence.settings.upset_bonus.tiers;
const pct = (share: number) => `${Math.round(share * 1000) / 10}%`;

/**
 * Editable pool settings. Serializes to a hidden `settings` input (JSON) that the
 * server action validates with zod. `lockedCore` disables fields that can't change
 * once a week has opened.
 */
export function SettingsFields({ initial, lockedCore = false }: { initial: PoolSettings; lockedCore?: boolean }) {
  const [s, setS] = useState<PoolSettings>(initial);
  const [segmentText, setSegmentText] = useState(() => (initial.segments ?? []).map((x) => x.first_week).join(", "));
  const segmentError = parseSegmentWeeks(segmentText).error;
  const set = (patch: Partial<PoolSettings>) => setS((prev) => ({ ...prev, ...patch }));
  const tierTotal = s.confidence?.tiers.reduce((n, t) => n + t.count, 0) ?? 0;
  const value: PoolSettings = { ...s, visibility: { show_picks_after: s.lock.mode === "weekly" ? "lock" : "game_start" } };

  return (
    <div className="space-y-7">
      <input type="hidden" name="settings" value={JSON.stringify(value)} />
      {lockedCore && (
        <p className="rounded-[10px] bg-bg p-3 text-sm text-muted">
          A week has opened, so pick type, pick count, confidence tiers, and the wrong-pick, upset and missed-week
          rules are locked for the season.
        </p>
      )}

      <fieldset className="grid gap-4 disabled:opacity-60 sm:grid-cols-2" disabled={lockedCore}>
        <SectionLabel className="sm:col-span-2">Picks</SectionLabel>
        <Field label="Pick type">
          <select className={field} value={s.pick_type} onChange={(e) => set({ pick_type: e.target.value as PoolSettings["pick_type"] })}>
            <option value="straight_up">Straight up (pick the winner)</option>
            <option value="ats">Against the spread</option>
          </select>
        </Field>
        <Field label="Picks per week">
          <input
            type="number" min={1} max={100} className={`${field} tabular-nums`} value={s.picks_per_slate}
            onChange={(e) => {
              const n = Number(e.target.value);
              set({ picks_per_slate: n, confidence: s.confidence ? { ...s.confidence, tiers: evenTiers(n, s.confidence.tiers.map((t) => t.points)) } : null });
            }}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
          <input
            type="checkbox" className={checkbox} checked={Boolean(s.confidence)}
            onChange={(e) => set({ confidence: e.target.checked ? { tiers: evenTiers(s.picks_per_slate), wrong_pick: "zero" } : null })}
          />
          <span className="text-[15px]">Confidence points (assign a point value to each pick)</span>
        </label>
        {s.confidence && (
          <div className="sm:col-span-2">
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-muted">Tiers</span>
              <span className={`tabular-nums ${tierTotal === s.picks_per_slate ? "text-muted" : "font-semibold text-loss"}`}>
                {tierTotal} of {s.picks_per_slate} picks
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {s.confidence.tiers.map((t, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 rounded-[10px] bg-hover p-1.5 pt-2">
                  <span className="text-xl font-semibold leading-none tabular-nums text-ink">{t.points}</span>
                  <span className="text-[11px] leading-none text-muted">pts</span>
                  <input
                    type="number" min={0} aria-label={`How many ${t.points}s`}
                    className="h-11 w-full rounded-lg bg-bg text-center text-[15px] font-medium tabular-nums text-accent outline-none focus:ring-2 focus:ring-accent"
                    value={t.count}
                    onChange={(e) => {
                      const tiers = s.confidence!.tiers.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x));
                      set({ confidence: { ...s.confidence!, tiers } });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <SectionLabel className="sm:col-span-2">Scoring</SectionLabel>
        <Field label="Players must make" hint={s.full_card ? "Picks save only as a full card." : "Partial weeks are saved; unpicked slots score 0."}>
          <select className={field} value={s.picks_mode} onChange={(e) => set({ picks_mode: e.target.value as PoolSettings["picks_mode"] })}>
            <option value="exact">Exactly {s.picks_per_slate} picks</option>
            <option value="max">Up to {s.picks_per_slate} picks</option>
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
          <input type="checkbox" className={checkbox} checked={s.full_card} onChange={(e) => set({ full_card: e.target.checked })} />
          <span className="text-[15px]">
            Require all {s.picks_per_slate} picks to save
            <span className="block text-xs text-muted">Players save a full card; picks on games that haven&apos;t locked can still be changed.</span>
          </span>
        </label>
        {!s.confidence && (
          <div className="grid grid-cols-3 gap-2">
            {(["win", "push", "loss"] as const).map((k) => (
              <Field key={k} label={`Pts / ${k}`}>
                <input
                  type="number" step={0.5} className={`${field} text-right tabular-nums`} value={s.scoring[k]}
                  onChange={(e) => set({ scoring: { ...s.scoring, [k]: Number(e.target.value) } })}
                />
              </Field>
            ))}
          </div>
        )}
      </div>

      <fieldset className="grid gap-4 disabled:opacity-60 sm:grid-cols-2" disabled={lockedCore}>
        {s.confidence && (
          <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
            <input
              type="checkbox" className={checkbox} checked={s.confidence.wrong_pick === "minus_points"}
              onChange={(e) => set({ confidence: { ...s.confidence!, wrong_pick: e.target.checked ? "minus_points" : "zero" } })}
            />
            <span className="text-[15px]">Wrong picks lose their points</span>
          </label>
        )}
        <div className="sm:col-span-2">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox" className={checkbox} checked={Boolean(s.upset_bonus)}
              onChange={(e) => set({ upset_bonus: e.target.checked ? { tiers: [...DEFAULT_UPSET_TIERS] } : null })}
            />
            <span className="text-[15px]">Upset bonus</span>
          </label>
          {s.upset_bonus && (
            <p className="ml-8 text-sm text-muted tabular-nums">
              {s.upset_bonus.tiers.map((t) => `+${t.bonus} over ${pct(t.min_share)}`).join(" · ")}
              <span className="mt-0.5 block text-xs">
                For a correct pick on the side the pool was against, by the other side&apos;s share of the pool&apos;s
                {s.confidence ? " points" : " picks"} on that game.
              </span>
            </p>
          )}
        </div>
        <Field label="No picks at all for a week">
          <select className={field} value={s.missed_week} onChange={(e) => set({ missed_week: e.target.value as PoolSettings["missed_week"] })}>
            <option value="zero">Score 0</option>
            <option value="last_place">Same as last place</option>
          </select>
        </Field>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <SectionLabel className="sm:col-span-2">Locks and weeks</SectionLabel>
        <Field label="Pick lock">
          <select
            className={field} value={s.lock.mode}
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
                className={field} value={s.lock.weekly.weekday}
                onChange={(e) => set({ lock: { mode: "weekly", weekly: { ...s.lock.weekly!, weekday: Number(e.target.value) as 0 } } })}
              >
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </Field>
            <Field label="Time">
              <input
                type="time" className={`${field} tabular-nums`} value={s.lock.weekly.time}
                onChange={(e) => set({ lock: { mode: "weekly", weekly: { ...s.lock.weekly!, time: e.target.value } } })}
              />
            </Field>
          </div>
        )}
        {s.lock.mode === "weekly" && s.lock.weekly && (
          <Field
            label={`${WEEKDAYS[s.window.start_weekday]} games due`}
            hint={`Optional earlier deadline for the week's first ${WEEKDAYS[s.window.start_weekday]}, or that day's first tip if earlier. Blank = one deadline.`}
          >
            <input
              type="time" className={`${field} tabular-nums`} value={s.lock.weekly.first_day_time ?? ""}
              onChange={(e) => {
                // An absent key, not "", means no first-day deadline (zod rejects "").
                const weekly = { ...s.lock.weekly!, first_day_time: e.target.value || undefined };
                if (!weekly.first_day_time) delete weekly.first_day_time;
                set({ lock: { mode: "weekly", weekly } });
              }}
            />
          </Field>
        )}

        <Field label="Time zone">
          <select className={field} value={s.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace("America/", "").replace("_", " ")}</option>)}
          </select>
        </Field>
        <Field label="Week starts" hint={`${s.window.length_days}-day weeks, from midnight`}>
          <select
            className={field} value={s.window.start_weekday}
            onChange={(e) => set({ window: { ...s.window, start_weekday: Number(e.target.value) } })}
          >
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </Field>
        <Field
          label="Segments start at weeks"
          hint={
            segmentError ? (
              <span className="text-loss">{segmentError}</span>
            ) : s.segments ? (
              <>
                {s.segments.length} segment{s.segments.length === 1 ? "" : "s"} with their own standings.{" "}
                <button
                  type="button" className="font-medium text-accent"
                  onClick={() => {
                    setSegmentText("");
                    set({ segments: null });
                  }}
                >
                  Clear
                </button>
              </>
            ) : (
              "Optional. Split the season, like 1, 6, 11, for separate standings."
            )
          }
        >
          <input
            type="text" inputMode="numeric" placeholder="1, 6, 11" className={`${field} tabular-nums`} value={segmentText}
            onChange={(e) => {
              setSegmentText(e.target.value);
              // Invalid entries still serialize, so the server's validation message backs up the hint.
              set({ segments: parseSegmentWeeks(e.target.value).segments });
            }}
          />
        </Field>
      </div>

      {/* Lines only matter against the spread; straight-up pools (picking winners) have none. */}
      {s.pick_type === "ats" && (
      <div className="grid gap-4 sm:grid-cols-2">
        <SectionLabel className="sm:col-span-2">Lines</SectionLabel>
        <Field label="Line source" hint="One sportsbook is the source of truth for spreads.">
          <select className={field} value={s.lines.bookmaker} onChange={(e) => set({ lines: { ...s.lines, bookmaker: e.target.value } })}>
            {BOOKMAKERS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        {s.pick_type === "ats" && (
          <label className="flex min-h-11 items-center gap-3 sm:self-start sm:pt-7">
            <input
              type="checkbox" className={checkbox} checked={s.lines.force_half_point}
              onChange={(e) => set({ lines: { ...s.lines, force_half_point: e.target.checked } })}
            />
            <span className="text-[15px]">Add a half point to whole-number spreads (no pushes)</span>
          </label>
        )}
      </div>
      )}
    </div>
  );
}
