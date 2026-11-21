"use client";

import { useState } from "react";
import { Segmented, SettingRow, SettingsSection, Toggle, settingInput } from "@/components/SettingsUI";
import { survivorRules, survivorSettingsError, type SurvivorSettings } from "@/lib/survivor";

/**
 * Survivor rules: lives, ties, whether a team can be reused, and the week the pool starts.
 * Serializes to a hidden `rules` input (JSON). Used on Start a Pool and Commissioner → Settings.
 */
export function SurvivorRulesFields({ initial, started = false }: { initial: SurvivorSettings; started?: boolean }) {
  const [s, setS] = useState<SurvivorSettings>(initial);
  const set = (patch: Partial<SurvivorSettings>) => setS((p) => ({ ...p, ...patch }));
  const problem = survivorSettingsError(s);
  return (
    <div className="space-y-4">
      <input type="hidden" name="rules" value={JSON.stringify(s)} />
      <div className="rounded-2xl bg-accent/10 p-4 ring-1 ring-accent/30">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">The rules at a glance</div>
        <ul className="mt-1.5 space-y-0.5 text-[15px] text-ink">
          {survivorRules(s).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {problem && <p className="mt-2 text-sm font-semibold text-loss">{problem}</p>}
        {started && <p className="mt-2 text-xs text-muted">The pool is under way. Changing a rule re-reads every week so far, so standings can change.</p>}
      </div>

      <SettingsSection title="Elimination" description="How an entry goes out.">
        <SettingRow label="Lives" hint={s.lives === 1 ? "Classic survivor: the first loss ends your season." : `An entry is out after its ${s.lives === 2 ? "second" : "third"} loss.`}>
          <Segmented
            ariaLabel="Lives"
            value={s.lives}
            onChange={(v) => set({ lives: v })}
            options={[
              { value: 1, label: "1 (one and done)" },
              { value: 2, label: "2" },
              { value: 3, label: "3" },
            ]}
          />
        </SettingRow>
        <SettingRow label="A tied game" hint="NFL games can end in a tie.">
          <Segmented
            ariaLabel="A tied game counts as"
            value={s.tie}
            onChange={(v) => set({ tie: v })}
            options={[
              { value: "loss", label: "Counts as a loss" },
              { value: "win", label: "Counts as a win" },
            ]}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Picks" description="One team a week. Each week's games come from Commissioner → Slate.">
        <SettingRow label="Each team only once" hint={s.reuse ? "Off: the same team can be picked again." : "Once a team is picked, it's used up for the season."}>
          <Toggle label="Each team only once" checked={!s.reuse} onChange={(v) => set({ reuse: !v })} />
        </SettingRow>
        <SettingRow label="Pool starts in week" hint="Weeks before this don't count. Use the week numbers on your Slate page.">
          <input
            type="number" min={1} max={30} aria-label="Pool starts in week" value={s.start_week}
            onChange={(e) => set({ start_week: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
            className={`${settingInput} w-24 text-center tabular-nums`}
          />
        </SettingRow>
      </SettingsSection>
    </div>
  );
}
