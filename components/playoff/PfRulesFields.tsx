"use client";

import { useState } from "react";
import { Segmented, SettingRow, SettingsSection, Toggle, settingInput } from "@/components/SettingsUI";
import { NFL_COM_ROSTER, PF_DEFAULT, POSITIONS, POSITION_NAME, pfRules, pfSettingsError, rosterSize, type PfScoring, type PfSettings } from "@/lib/playoffFantasy";

/** Every scoring value, for the "all values" grid: label, key, and the step its input moves by. */
const VALUES: { group: string; rows: [keyof PfScoring, string, number][] }[] = [
  {
    group: "Passing",
    rows: [
      ["pass_yds_per_pt", "Yards for 1 point", 1],
      ["pass_td", "Touchdown", 1],
      ["pass_int", "Interception thrown", 1],
    ],
  },
  {
    group: "Rushing and receiving",
    rows: [
      ["yds_per_pt", "Yards for 1 point", 1],
      ["rush_td", "Rushing touchdown", 1],
      ["rec_td", "Receiving touchdown", 1],
      ["rec", "Each catch", 0.5],
      ["fum_lost", "Fumble lost", 1],
      ["two_pt", "Two-point conversion (pass, catch or run)", 1],
    ],
  },
  {
    group: "Kicker",
    rows: [
      ["fg", "Field goal under 40 yards", 1],
      ["fg_40", "Field goal, 40-49 yards", 1],
      ["fg_50", "Field goal, 50 yards or more", 1],
      ["xp", "Extra point", 1],
    ],
  },
  {
    group: "Defense",
    rows: [
      ["def_sack", "Sack", 0.5],
      ["def_int", "Interception", 1],
      ["def_fum_rec", "Fumble recovered", 1],
      ["def_td", "Touchdown (defense or return)", 1],
      ["def_safety", "Safety", 1],
    ],
  },
];

/**
 * Playoff Fantasy rules: the roster by position, the scoring (the common choices up front,
 * every value behind "All scoring values") and, on the pool's Settings page, when rosters
 * lock. Serializes to a hidden `rules` input (JSON); the lock time is its own field.
 */
export function PfRulesFields({ initial, lockLocal, locked = false }: { initial: PfSettings; /** The lock time as a datetime-local value (the Settings page only). */ lockLocal?: string; locked?: boolean }) {
  const [s, setS] = useState<PfSettings>(initial);
  const sc = s.scoring;
  const setScoring = (patch: Partial<PfScoring>) => setS((p) => ({ ...p, scoring: { ...p.scoring, ...patch } }));
  const problem = pfSettingsError(s);
  const bonuses = sc.bonus_pass_300 > 0 || sc.bonus_rush_100 > 0 || sc.bonus_rec_100 > 0;
  const size = rosterSize(s);
  const numInput = `${settingInput} w-20 text-center tabular-nums`;
  const numberOf = (v: string, fallback: number) => (v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

  return (
    <div className="space-y-4">
      <input type="hidden" name="rules" value={JSON.stringify(s)} />
      <div className="rounded-2xl bg-accent/10 p-4 ring-1 ring-accent/30">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">The rules at a glance</div>
        <ul className="mt-1.5 space-y-0.5 text-[15px] text-ink">
          {pfRules(s).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {problem && <p className="mt-2 text-sm font-semibold text-loss">{problem}</p>}
        {locked && <p className="mt-2 text-xs text-muted">Rosters have locked, so the roster spots can&apos;t change. Scoring changes re-score everyone.</p>}
      </div>

      <SettingsSection title="Style" description="One roster for the whole playoffs, or a new lineup every round like the old NFL.com Playoff Challenge.">
        <SettingRow
          label="Format"
          locked={locked}
          hint={
            s.style === "weekly"
              ? "Weekly lineups (NFL.com style): any players, no team limit. Keep a player in your lineup and his points multiply, 2x his second straight round up to 4x; swap him out and he starts over."
              : "Season roster: one lineup before the Wild Card round, one player from each playoff team, every player scoring every round."
          }
        >
          <Segmented
            ariaLabel="Format"
            value={s.style}
            onChange={(v) =>
              !locked &&
              setS((p) =>
                v === p.style
                  ? p
                  : // Each style starts from its usual lineup and catch scoring (both stay editable).
                    { ...p, style: v, roster: v === "weekly" ? { ...NFL_COM_ROSTER } : { ...PF_DEFAULT.roster }, scoring: { ...p.scoring, rec: v === "weekly" ? 0 : 1 } },
              )
            }
            options={[
              { value: "roster" as const, label: "Season roster" },
              { value: "weekly" as const, label: "Weekly (NFL.com)" },
            ]}
          />
        </SettingRow>
        {s.style === "weekly" && (
          <SettingRow
            label="Lineups lock"
            hint={s.weekly_lock === "player" ? "Each player locks when his own game kicks off, so a Sunday player can still be swapped after Saturday's games start." : "The whole lineup locks when the round's first game kicks off."}
          >
            <Segmented
              ariaLabel="When lineups lock"
              value={s.weekly_lock}
              onChange={(v) => setS((p) => ({ ...p, weekly_lock: v }))}
              options={[
                { value: "player" as const, label: "At each kickoff" },
                { value: "week" as const, label: "At the round's first game" },
              ]}
            />
          </SettingRow>
        )}
      </SettingsSection>

      {lockLocal !== undefined && s.style === "roster" && (
        <SettingsSection title="Lock" description="Rosters can be changed until this moment, then everyone's roster shows.">
          <SettingRow label="Rosters lock" hint="Set by itself to the first Wild Card kickoff when the playoff field loads. Change it here if you want another time (pool time).">
            <input name="lock_at_local" type="datetime-local" aria-label="Rosters lock" defaultValue={lockLocal} className={`${settingInput} tabular-nums`} />
          </SettingRow>
        </SettingsSection>
      )}

      <SettingsSection
        title="Roster"
        description={
          s.style === "weekly"
            ? `How many players at each position, every round. ${size} spots in all (NFL.com used 8: QB, 2 RB, 2 WR, TE, K, DEF).`
            : `How many players at each position. ${size} spots in all: with one player per team, ${size === 14 ? "that's exactly one from each of the 14 playoff teams." : `${14 - size} of the 14 playoff teams go unused.`}`
        }
      >
        <SettingRow stack label="Spots" locked={locked}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {POSITIONS.map((p) => (
              <label key={p} className="flex flex-col items-center gap-1 rounded-xl bg-bg p-2" title={POSITION_NAME[p]}>
                <span className="text-xs font-semibold text-muted">{p}</span>
                <input
                  type="number" min={0} max={10} aria-label={`${POSITION_NAME[p]} spots`} value={s.roster[p]}
                  onChange={(e) => setS((prev) => ({ ...prev, roster: { ...prev.roster, [p]: Math.max(0, Math.min(10, Math.round(Number(e.target.value) || 0))) } }))}
                  className="h-9 w-full rounded-lg bg-surface text-center text-[15px] font-semibold tabular-nums text-accent outline-none focus:ring-2 focus:ring-accent"
                />
              </label>
            ))}
          </div>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Scoring" description="Starts from the most common league scoring. The usual choices are here; every value is below.">
        <SettingRow label="Catches" hint={sc.rec === 1 ? "PPR: a point for every reception." : sc.rec === 0.5 ? "Half PPR: half a point for every reception." : sc.rec === 0 ? "Standard: no points for a reception." : `${sc.rec} points for every reception.`}>
          <Segmented
            ariaLabel="Points per catch (PPR or non-PPR)"
            value={sc.rec === 1 || sc.rec === 0.5 || sc.rec === 0 ? sc.rec : -1}
            onChange={(v) => v >= 0 && setScoring({ rec: v })}
            options={[
              { value: 1, label: "PPR" },
              { value: 0.5, label: "Half PPR" },
              { value: 0, label: "Standard" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Passing touchdown">
          <Segmented
            ariaLabel="Points per passing touchdown"
            value={sc.pass_td === 4 || sc.pass_td === 6 ? sc.pass_td : -1}
            onChange={(v) => v >= 0 && setScoring({ pass_td: v })}
            options={[
              { value: 4, label: "4 points" },
              { value: 6, label: "6 points" },
            ]}
          />
        </SettingRow>
        <SettingRow label="Yardage bonuses" hint="Extra points for a 300-yard passing game, or a 100-yard rushing or receiving game.">
          <Toggle
            label="Yardage bonuses"
            checked={bonuses}
            onChange={(v) => setScoring(v ? { bonus_pass_300: 3, bonus_rush_100: 3, bonus_rec_100: 3 } : { bonus_pass_300: 0, bonus_rush_100: 0, bonus_rec_100: 0 })}
          />
        </SettingRow>
        {bonuses && (
          <SettingRow stack label="Bonus points">
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["bonus_pass_300", "300+ passing yards"],
                  ["bonus_rush_100", "100+ rushing yards"],
                  ["bonus_rec_100", "100+ receiving yards"],
                ] as [keyof PfScoring, string][]
              ).map(([k, label]) => (
                <label key={k} className="flex items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2 text-sm">
                  {label}
                  <input type="number" min={0} max={20} step={0.5} aria-label={label} value={sc[k] as number} onChange={(e) => setScoring({ [k]: Math.max(0, numberOf(e.target.value, 0)) })} className={numInput} />
                </label>
              ))}
            </div>
          </SettingRow>
        )}
        <SettingRow label="Defense: points allowed" hint="10 for a shutout, 7 for 1-6, 4 for 7-13, 1 for 14-20, 0 for 21-27, -1 for 28-34, -4 for 35 or more.">
          <Toggle label="Score defenses on points allowed" checked={sc.def_points_allowed} onChange={(v) => setScoring({ def_points_allowed: v })} />
        </SettingRow>
        <details className="py-3">
          <summary className="cursor-pointer text-[15px] font-semibold text-accent">All scoring values</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {VALUES.map((g) => (
              <div key={g.group}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.group}</div>
                <ul className="space-y-1.5">
                  {g.rows.map(([k, label, step]) => (
                    <li key={k}>
                      <label className="flex items-center justify-between gap-2 rounded-xl bg-bg px-3 py-1.5 text-sm">
                        {label}
                        <input
                          type="number" step={step} aria-label={`${g.group}: ${label}`} value={sc[k] as number}
                          onChange={(e) => setScoring({ [k]: numberOf(e.target.value, PF_DEFAULT.scoring[k] as number) })}
                          className={numInput}
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setS((p) => ({ ...p, scoring: { ...PF_DEFAULT.scoring } }))} className="mt-3 rounded-full px-3 py-1.5 text-sm font-semibold text-muted ring-1 ring-line hover:text-ink">
            Reset to the common scoring
          </button>
        </details>
      </SettingsSection>
    </div>
  );
}
