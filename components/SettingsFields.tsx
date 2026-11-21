"use client";

import { useState } from "react";
import { PRESETS, evenTiers, parseSegmentWeeks, type PoolSettings } from "@/lib/poolSettings";
import { OptionCards, Segmented, SettingRow, SettingsSection, Toggle, settingInput } from "./SettingsUI";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES: [string, string][] = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
];
const BOOKMAKERS: [string, string][] = [
  ["draftkings", "DraftKings"],
  ["fanduel", "FanDuel"],
  ["betmgm", "BetMGM"],
  ["williamhill_us", "Caesars"],
  ["espnbet", "ESPN BET"],
  ["betrivers", "BetRivers"],
];

// Turning the upset bonus on starts from the guidelines' tiers (+1 over 80%, +2 over 90%, +3 over 95%).
const DEFAULT_UPSET_TIERS = PRESETS.ncaab_confidence.settings.upset_bonus.tiers;
const pct = (share: number) => `${Math.round(share * 1000) / 10}%`;
const num = (n: number) => (Number.isInteger(n) ? String(n) : n === 0.5 ? "½" : String(n));
const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** The rules in a sentence or two, so a commissioner can check them at a glance. */
function summary(s: PoolSettings): string[] {
  const what = s.pick_type === "ats" ? "against the spread" : "straight up (pick the winner)";
  const count = `${s.picks_mode === "exact" ? "exactly" : "up to"} ${s.picks_per_slate}`;
  const lines = [`Players make ${count} picks ${what} each week${s.full_card ? ", saved as a full card" : ""}.`];
  if (s.confidence) {
    const pts = s.confidence.tiers.map((t) => `${t.count}×${t.points}`).join(", ");
    lines.push(`Confidence points (${pts}); a wrong pick ${s.confidence.wrong_pick === "minus_points" ? "loses its points" : "scores 0"}.`);
  } else {
    lines.push(`Win ${num(s.scoring.win)} · Push ${num(s.scoring.push)} · Loss ${num(s.scoring.loss)}, ranked by ${s.standings_by === "points" ? "points" : "record"}.`);
  }
  if (s.upset_bonus) lines.push(`Upset bonus: ${[...s.upset_bonus.tiers].sort((a, b) => a.min_share - b.min_share).map((t) => `+${num(t.bonus)} over ${pct(t.min_share)}`).join(", ")}.`);
  lines.push(
    s.lock.mode === "per_game"
      ? "Each game locks when it starts."
      : `Picks are due ${WEEKDAYS[s.lock.weekly?.weekday ?? 0]} at ${time12(s.lock.weekly?.time ?? "12:00")}${s.lock.weekly?.first_day_time ? `, ${WEEKDAYS[s.window.start_weekday]} games by ${time12(s.lock.weekly.first_day_time)}` : ""}.`,
  );
  return lines;
}

/**
 * Editable pool settings, grouped by topic: Picks, Scoring, Deadlines, Season and (against the
 * spread) Lines. Serializes to a hidden `settings` input (JSON) that the server action validates
 * with zod. `lockedCore` locks the settings that can't change once a week has opened.
 */
export function SettingsFields({ initial, lockedCore = false }: { initial: PoolSettings; lockedCore?: boolean }) {
  const [s, setS] = useState<PoolSettings>(initial);
  const [segmentText, setSegmentText] = useState(() => (initial.segments ?? []).map((x) => x.first_week).join(", "));
  const segmentError = parseSegmentWeeks(segmentText).error;
  const set = (patch: Partial<PoolSettings>) => setS((prev) => ({ ...prev, ...patch }));
  const tierTotal = s.confidence?.tiers.reduce((n, t) => n + t.count, 0) ?? 0;
  const value: PoolSettings = { ...s, visibility: { show_picks_after: s.lock.mode === "weekly" ? "lock" : "game_start" } };
  const locked = lockedCore;

  return (
    <div className="space-y-4">
      <input type="hidden" name="settings" value={JSON.stringify(value)} />

      {/* The rules at a glance; updates as settings change. */}
      <div className="rounded-2xl bg-accent/10 p-4 ring-1 ring-accent/30">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">The rules at a glance</div>
        <ul className="mt-1.5 space-y-0.5 text-[15px] text-ink">
          {summary(value).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {locked && <p className="mt-2 text-xs text-muted">A week has opened, so the settings marked with a lock can&apos;t change this season.</p>}
      </div>

      <SettingsSection title="Picks" description="What players pick each week.">
        <SettingRow label="Pick" locked={locked}>
          <Segmented
            ariaLabel="Pick type"
            value={s.pick_type}
            onChange={(v) => set({ pick_type: v })}
            options={[
              { value: "straight_up", label: "The winner" },
              { value: "ats", label: "Against the spread" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Picks each week" locked={locked}>
          <input
            type="number" min={1} max={100} aria-label="Picks each week" className={`${settingInput} w-24 text-center tabular-nums`} value={s.picks_per_slate}
            onChange={(e) => {
              const n = Number(e.target.value);
              set({ picks_per_slate: n, confidence: s.confidence ? { ...s.confidence, tiers: evenTiers(n, s.confidence.tiers.map((t) => t.points)) } : null });
            }}
          />
        </SettingRow>
        <SettingRow label="Players make" hint={s.picks_mode === "max" ? "Fewer is fine; unused picks score nothing." : "Every pick is required."}>
          <Segmented
            ariaLabel="Players make"
            value={s.picks_mode}
            onChange={(v) => set({ picks_mode: v })}
            options={[
              { value: "exact", label: `Exactly ${s.picks_per_slate}` },
              { value: "max", label: `Up to ${s.picks_per_slate}` },
            ]}
          />
        </SettingRow>
        <SettingRow label="Save only a full card" hint="Picks save once all of them are made. Picks on games that haven't started can still be swapped.">
          <Toggle label="Save only a full card" checked={s.full_card} onChange={(v) => set({ full_card: v })} />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Scoring" description="What each pick is worth, and how the standings rank players.">
        <SettingRow label="Confidence points" hint="Players give each pick a point value; their surest picks are worth the most." locked={locked}>
          <Toggle
            label="Confidence points"
            checked={Boolean(s.confidence)}
            onChange={(v) => set({ confidence: v ? { tiers: evenTiers(s.picks_per_slate), wrong_pick: "zero" } : null })}
          />
        </SettingRow>
        {s.confidence && (
          <SettingRow
            stack
            locked={locked}
            label="Point values"
            hint={
              <span className={tierTotal === s.picks_per_slate ? "" : "font-semibold text-loss"}>
                How many picks get each value: {tierTotal} of {s.picks_per_slate} assigned.
              </span>
            }
          >
            <div className="grid grid-cols-5 gap-2">
              {s.confidence.tiers.map((t, i) => (
                <label key={i} className="flex flex-col items-center gap-1 rounded-xl bg-bg p-2">
                  <span className="text-lg font-bold leading-none tabular-nums text-ink">{t.points}</span>
                  <span className="text-[11px] leading-none text-muted">points</span>
                  <input
                    type="number" min={0} aria-label={`Picks worth ${t.points}`}
                    className="mt-1 h-9 w-full rounded-lg bg-surface text-center text-[15px] font-semibold tabular-nums text-accent outline-none focus:ring-2 focus:ring-accent"
                    value={t.count}
                    onChange={(e) => {
                      const tiers = s.confidence!.tiers.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x));
                      set({ confidence: { ...s.confidence!, tiers } });
                    }}
                  />
                </label>
              ))}
            </div>
          </SettingRow>
        )}
        {s.confidence ? (
          <SettingRow label="Wrong picks lose their points" hint="Off: a wrong pick scores 0." locked={locked}>
            <Toggle
              label="Wrong picks lose their points"
              checked={s.confidence.wrong_pick === "minus_points"}
              onChange={(v) => set({ confidence: { ...s.confidence!, wrong_pick: v ? "minus_points" : "zero" } })}
            />
          </SettingRow>
        ) : (
          <SettingRow label="Points per pick">
            <div className="flex gap-2">
              {(["win", "push", "loss"] as const).map((k) => (
                <label key={k} className="flex flex-col items-center gap-1">
                  <span className="text-xs capitalize text-muted">{k}</span>
                  <input
                    type="number" step={0.5} aria-label={`Points for a ${k}`} className={`${settingInput} w-20 text-center tabular-nums`} value={s.scoring[k]}
                    onChange={(e) => set({ scoring: { ...s.scoring, [k]: Number(e.target.value) } })}
                  />
                </label>
              ))}
            </div>
          </SettingRow>
        )}
        {!s.confidence && (
          <SettingRow label="Rank standings by" hint={s.standings_by === "points" ? "Points first, with a Pts column." : "Win–loss record; points aren't shown."}>
            <Segmented
              ariaLabel="Rank standings by"
              value={s.standings_by}
              onChange={(v) => set({ standings_by: v })}
              options={[
                { value: "record", label: "Record" },
                { value: "points", label: "Points" },
              ]}
            />
          </SettingRow>
        )}
        <SettingRow
          label="Upset bonus"
          locked={locked}
          hint={`Extra points for a correct pick most of the pool went against, by how much of the pool's ${s.confidence ? "points" : "picks"} were on the other side.`}
        >
          <Toggle label="Upset bonus" checked={Boolean(s.upset_bonus)} onChange={(v) => set({ upset_bonus: v ? { tiers: [...DEFAULT_UPSET_TIERS] } : null })} />
        </SettingRow>
        {s.upset_bonus && (
          <SettingRow stack locked={locked} label="Bonus amounts" hint="The biggest bonus a pick qualifies for is the one it gets.">
            <div className="space-y-2">
              {[...s.upset_bonus.tiers]
                .map((t, i) => ({ t, i }))
                .sort((a, b) => a.t.min_share - b.t.min_share)
                .map(({ t, i }) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-ink">+</span>
                    <input
                      type="number" min={0.5} step={0.5} aria-label="Bonus points" value={t.bonus}
                      onChange={(e) => set({ upset_bonus: { tiers: s.upset_bonus!.tiers.map((x, j) => (j === i ? { ...x, bonus: Number(e.target.value) } : x)) } })}
                      className={`${settingInput} w-20 text-center tabular-nums`}
                    />
                    <span className="text-muted">when more than</span>
                    <input
                      type="number" min={51} max={99} step={1} aria-label="Share on the other side (%)" value={Math.round(t.min_share * 100)}
                      onChange={(e) => set({ upset_bonus: { tiers: s.upset_bonus!.tiers.map((x, j) => (j === i ? { ...x, min_share: Number(e.target.value) / 100 } : x)) } })}
                      className={`${settingInput} w-20 text-center tabular-nums`}
                    />
                    <span className="text-muted">% were on the other side</span>
                    {s.upset_bonus!.tiers.length > 1 && (
                      <button
                        type="button" aria-label="Remove this bonus" className="ml-auto rounded-full px-2 py-1 text-xs font-semibold text-muted hover:bg-hover hover:text-loss"
                        onClick={() => set({ upset_bonus: { tiers: s.upset_bonus!.tiers.filter((_, j) => j !== i) } })}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              {s.upset_bonus.tiers.length < 6 && (
                <button
                  type="button" className="rounded-full px-3 py-1.5 text-sm font-semibold text-accent hover:bg-hover"
                  onClick={() => {
                    const top = Math.max(...s.upset_bonus!.tiers.map((t) => t.min_share));
                    const bonus = Math.max(...s.upset_bonus!.tiers.map((t) => t.bonus)) + 1;
                    set({ upset_bonus: { tiers: [...s.upset_bonus!.tiers, { min_share: Math.min(0.99, Math.round((top + 0.03) * 100) / 100), bonus }] } });
                  }}
                >
                  + Add a bonus level
                </button>
              )}
            </div>
          </SettingRow>
        )}
        <SettingRow label="A player who misses a whole week" locked={locked}>
          <Segmented
            ariaLabel="A player who misses a whole week"
            value={s.missed_week}
            onChange={(v) => set({ missed_week: v })}
            options={[
              { value: "zero", label: "Scores 0" },
              { value: "last_place", label: "Gets last place's score" },
            ]}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Deadlines" description="When picks lock, and how the weeks run.">
        <SettingRow label="Picks lock" stack>
          <OptionCards
            ariaLabel="Picks lock"
            value={s.lock.mode}
            onChange={(v) => set({ lock: v === "weekly" ? { mode: "weekly", weekly: s.lock.weekly ?? { weekday: 2, time: "19:00" } } : { mode: "per_game" } })}
            options={[
              { value: "per_game", label: "When each game starts", text: "Players can pick right up to each game." },
              { value: "weekly", label: "At one weekly deadline", text: "All picks are due at once; games before it lock at their start." },
            ]}
          />
        </SettingRow>
        {s.lock.mode === "weekly" && s.lock.weekly && (
          <>
            <SettingRow label="Deadline">
              <div className="flex gap-2">
                <select
                  aria-label="Deadline day" className={settingInput} value={s.lock.weekly.weekday}
                  onChange={(e) => set({ lock: { mode: "weekly", weekly: { ...s.lock.weekly!, weekday: Number(e.target.value) as 0 } } })}
                >
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
                <input
                  type="time" aria-label="Deadline time" className={`${settingInput} tabular-nums`} value={s.lock.weekly.time}
                  onChange={(e) => set({ lock: { mode: "weekly", weekly: { ...s.lock.weekly!, time: e.target.value } } })}
                />
              </div>
            </SettingRow>
            <SettingRow
              label={`Earlier deadline for ${WEEKDAYS[s.window.start_weekday]} games`}
              hint={`Optional. ${WEEKDAYS[s.window.start_weekday]} games are due by this time (or their start, if earlier). Leave blank for one deadline.`}
            >
              <input
                type="time" aria-label="Earlier deadline" className={`${settingInput} tabular-nums`} value={s.lock.weekly.first_day_time ?? ""}
                onChange={(e) => {
                  // An absent key, not "", means no first-day deadline (zod rejects "").
                  const weekly = { ...s.lock.weekly!, first_day_time: e.target.value || undefined };
                  if (!weekly.first_day_time) delete weekly.first_day_time;
                  set({ lock: { mode: "weekly", weekly } });
                }}
              />
            </SettingRow>
          </>
        )}
        <SettingRow label="Pool time zone" hint="Deadlines are set in this time zone. Players see game times in their own.">
          <select aria-label="Pool time zone" className={settingInput} value={s.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            {TIMEZONES.map(([tz, label]) => <option key={tz} value={tz}>{label}</option>)}
          </select>
        </SettingRow>
        <SettingRow label="Weeks start on" hint={`Each week runs ${s.window.length_days} days, from midnight.`}>
          <select
            aria-label="Weeks start on" className={settingInput} value={s.window.start_weekday}
            onChange={(e) => set({ window: { ...s.window, start_weekday: Number(e.target.value) } })}
          >
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Season" description="Optional extras across the season.">
        <SettingRow
          label="Bonus segments"
          hint={
            segmentError ? (
              <span className="text-loss">{segmentError}</span>
            ) : s.segments ? (
              <>
                {s.segments.length} segment{s.segments.length === 1 ? "" : "s"}, each with its own standings.{" "}
                <button type="button" className="font-semibold text-accent" onClick={() => { setSegmentText(""); set({ segments: null }); }}>
                  Remove
                </button>
              </>
            ) : (
              "Split the season into parts with their own standings. Enter the week each part starts, like 1, 6, 11."
            )
          }
        >
          <input
            type="text" inputMode="numeric" placeholder="1, 6, 11" aria-label="Bonus segments start at weeks" className={`${settingInput} w-36 tabular-nums`} value={segmentText}
            onChange={(e) => {
              setSegmentText(e.target.value);
              // Invalid entries still serialize, so the server's validation message backs up the hint.
              set({ segments: parseSegmentWeeks(e.target.value).segments });
            }}
          />
        </SettingRow>
      </SettingsSection>

      {/* Lines only matter against the spread. */}
      {s.pick_type === "ats" && (
        <SettingsSection title="Lines" description="Where the spreads come from. They're frozen when each week is published.">
          <SettingRow label="Sportsbook">
            <select aria-label="Sportsbook" className={settingInput} value={s.lines.bookmaker} onChange={(e) => set({ lines: { ...s.lines, bookmaker: e.target.value } })}>
              {BOOKMAKERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </SettingRow>
          <SettingRow label="No pushes" hint="Adds a half point to whole-number spreads, so every game has a winner against the spread.">
            <Toggle label="No pushes" checked={s.lines.force_half_point} onChange={(v) => set({ lines: { ...s.lines, force_half_point: v } })} />
          </SettingRow>
        </SettingsSection>
      )}
    </div>
  );
}
