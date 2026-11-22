"use client";

import { useState } from "react";
import { OptionCards, SettingRow, SettingsSection, Toggle, settingInput } from "@/components/SettingsUI";
import { ROUNDS } from "@/lib/bracket";
import { SCORING_PRESETS, pickXSettingsError, rulesSummary, winPoints, type PickXSettings } from "@/lib/pickx";

/**
 * Pick X rules: how many teams, the scoring (a preset or custom: seed or flat, a value per
 * round, a bonus per win) and the limits. Serializes to a hidden `pick_x` input (JSON).
 * Used on Start a Pool and the pool's Commissioner → Settings.
 */
export function PickXRulesFields({ initial, locked = false }: { initial: PickXSettings; locked?: boolean }) {
  const [s, setS] = useState<PickXSettings>(initial);
  const presetId = SCORING_PRESETS.find((p) => JSON.stringify(p.scoring) === JSON.stringify(s.scoring))?.id ?? "custom";
  const [custom, setCustom] = useState(presetId === "custom");
  const problem = pickXSettingsError(s);
  const setScoring = (patch: Partial<PickXSettings["scoring"]>) => setS((p) => ({ ...p, scoring: { ...p.scoring, ...patch } }));
  const setLimits = (patch: Partial<PickXSettings["limits"]>) => setS((p) => ({ ...p, limits: { ...p.limits, ...patch } }));

  return (
    <div className="space-y-4">
      <input type="hidden" name="pick_x" value={JSON.stringify(s)} />

      <div className="rounded-2xl bg-accent/10 p-4 ring-1 ring-accent/30">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">The rules at a glance</div>
        <ul className="mt-1.5 space-y-0.5 text-[15px] text-ink">
          {rulesSummary(s).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {problem && <p className="mt-2 text-sm font-semibold text-loss">{problem}</p>}
        {locked && <p className="mt-2 text-xs text-muted">Picks have locked, so the number of teams and the limits can&apos;t change. Scoring changes re-score everyone.</p>}
      </div>

      <SettingsSection title="Picks" description="How many teams each entry picks. The field and lock time come from Commissioner → Bracket.">
        <SettingRow label="Teams each entry picks" locked={locked}>
          <input
            type="number" min={1} max={32} aria-label="Teams each entry picks" value={s.picks}
            onChange={(e) => setS((p) => ({ ...p, picks: Math.max(1, Math.min(32, Number(e.target.value) || 1)) }))}
            className={`${settingInput} w-24 text-center tabular-nums`}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Scoring" description="What each win is worth. Pick a common setup or build your own.">
        <SettingRow label="Scoring" stack>
          <OptionCards
            ariaLabel="Scoring"
            value={custom ? "custom" : presetId}
            onChange={(id) => {
              if (id === "custom") return setCustom(true);
              setCustom(false);
              const p = SCORING_PRESETS.find((x) => x.id === id);
              if (p) setS((prev) => ({ ...prev, scoring: { ...p.scoring, rounds: [...p.scoring.rounds] } }));
            }}
            options={[
              ...SCORING_PRESETS.map((p) => ({ value: p.id, label: p.label, text: p.text })),
              { value: "custom", label: "Custom", text: "Set your own round values and bonus." },
            ]}
          />
        </SettingRow>
        {custom && (
          <>
            <SettingRow label="Multiply by the team's seed" hint="On: a 12 seed's win is worth 12 times the round value. Off: every team's win is worth the same.">
              <Toggle label="Multiply by the team's seed" checked={s.scoring.seed} onChange={(v) => setScoring({ seed: v })} />
            </SettingRow>
            <SettingRow stack label="Round values" hint="What a win in each round is worth (before the seed, if on).">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {ROUNDS.map((r, i) => (
                  <label key={r.round} className="flex flex-col items-center gap-1 rounded-xl bg-bg p-2">
                    <span className="text-xs font-semibold text-muted">{r.short}</span>
                    <input
                      type="number" min={0} step={0.5} aria-label={`${r.name} value`} value={s.scoring.rounds[i]}
                      onChange={(e) => setScoring({ rounds: s.scoring.rounds.map((v, j) => (j === i ? Math.max(0, Number(e.target.value) || 0) : v)) })}
                      className="h-9 w-full rounded-lg bg-surface text-center text-[15px] font-semibold tabular-nums text-accent outline-none focus:ring-2 focus:ring-accent"
                    />
                  </label>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="Bonus per win" hint="Added to every win.">
              <input
                type="number" min={0} step={0.5} aria-label="Bonus per win" value={s.scoring.bonus}
                onChange={(e) => setScoring({ bonus: Math.max(0, Number(e.target.value) || 0) })}
                className={`${settingInput} w-24 text-center tabular-nums`}
              />
            </SettingRow>
          </>
        )}
        <SettingRow
          stack
          label="Examples"
          hint={`A 1 seed's First Round win: ${winPoints(s.scoring, 1, 1)} · a 12 seed's First Round win: ${winPoints(s.scoring, 1, 12)} · a 5 seed winning the title game: ${winPoints(s.scoring, 6, 5)}.`}
        >
          <span />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Tiebreaker" description="What happens when entries finish with the same points.">
        <SettingRow label="Break ties with" stack>
          <OptionCards
            ariaLabel="Tiebreaker"
            value={s.tiebreaker}
            onChange={(v) => setS((p) => ({ ...p, tiebreaker: v }))}
            options={[
              { value: "none", label: "No tiebreaker", text: "Entries with the same points share the place." },
              { value: "title_total", label: "Championship total points", text: "Everyone guesses the title game's combined score with their picks. Closest guess wins a tie." },
            ]}
          />
        </SettingRow>
        {s.tiebreaker === "title_total" && (
          <SettingRow label="Championship game total" hint="Both teams' points added together. Fills in from ESPN after the game; type it here to set it yourself.">
            <input
              type="number" min={0} max={999} aria-label="Championship game total points" value={s.title_total ?? ""} placeholder="After the game"
              onChange={(e) => setS((p) => ({ ...p, title_total: e.target.value === "" ? null : Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0))) }))}
              className={`${settingInput} w-36 text-center tabular-nums`}
            />
          </SettingRow>
        )}
      </SettingsSection>

      <SettingsSection title="Limits" description="Optional rules on which teams an entry can pick.">
        <SettingRow label="One team per seed line" hint="No two teams with the same seed." locked={locked}>
          <Toggle label="One team per seed line" checked={s.limits.one_per_seed} onChange={(v) => setLimits({ one_per_seed: v })} />
        </SettingRow>
        <SettingRow label="Limit teams per region" hint={s.limits.max_per_region ? `Up to ${s.limits.max_per_region} from any one region.` : "Any number from one region."} locked={locked}>
          <div className="flex items-center gap-2">
            {s.limits.max_per_region !== null && (
              <input
                type="number" min={1} max={16} aria-label="Most teams from one region" value={s.limits.max_per_region}
                onChange={(e) => setLimits({ max_per_region: Math.max(1, Math.min(16, Number(e.target.value) || 1)) })}
                className={`${settingInput} w-20 text-center tabular-nums`}
              />
            )}
            <Toggle label="Limit teams per region" checked={s.limits.max_per_region !== null} onChange={(v) => setLimits({ max_per_region: v ? 2 : null })} />
          </div>
        </SettingRow>
        <SettingRow label="Minimum seed total" hint={s.limits.min_seed_total ? `A full set of picks has to have seeds adding up to at least ${s.limits.min_seed_total}.` : "Make entries take some underdogs."} locked={locked}>
          <div className="flex items-center gap-2">
            {s.limits.min_seed_total !== null && (
              <input
                type="number" min={1} max={999} aria-label="Minimum seed total" value={s.limits.min_seed_total}
                onChange={(e) => setLimits({ min_seed_total: Math.max(1, Number(e.target.value) || 1) })}
                className={`${settingInput} w-20 text-center tabular-nums`}
              />
            )}
            <Toggle label="Minimum seed total" checked={s.limits.min_seed_total !== null} onChange={(v) => setLimits({ min_seed_total: v ? s.picks * 5 : null })} />
          </div>
        </SettingRow>
      </SettingsSection>
    </div>
  );
}
