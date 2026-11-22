"use client";

import { useState } from "react";
import { OptionCards, SettingRow, SettingsSection, Toggle, settingInput } from "@/components/SettingsUI";
import { PAYOUT_PRESETS, QUARTERS, squaresRules, squaresSettingsError, type SquaresSettings } from "@/lib/squares";

/**
 * Squares rules: the price of a square, how many one entry can take, and how the pot is split
 * by quarter. Serializes to a hidden `rules` input (JSON). Used on Start a Pool and
 * Commissioner → Settings.
 */
export function SquaresRulesFields({ initial }: { initial: SquaresSettings }) {
  const [s, setS] = useState<SquaresSettings>(initial);
  const presetId = PAYOUT_PRESETS.find((p) => p.payouts.join() === s.payouts.join())?.id ?? "custom";
  const [custom, setCustom] = useState(presetId === "custom");
  const problem = squaresSettingsError(s);
  const full = s.price * 100;
  return (
    <div className="space-y-4">
      <input type="hidden" name="rules" value={JSON.stringify(s)} />
      <div className="rounded-2xl bg-accent/10 p-4 ring-1 ring-accent/30">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">The rules at a glance</div>
        <ul className="mt-1.5 space-y-0.5 text-[15px] text-ink">
          {squaresRules(s).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {problem && <p className="mt-2 text-sm font-semibold text-loss">{problem}</p>}
      </div>

      <SettingsSection title="Filling the board" description="Who writes the names on the 100 squares.">
        <SettingRow label="Names are entered by" stack>
          <OptionCards
            ariaLabel="Who fills the board"
            value={s.entry}
            onChange={(v) => setS((p) => ({ ...p, entry: v }))}
            options={[
              { value: "commissioner", label: "The commissioner", text: "You type each name into its square. Nobody else needs an account; share the board for people to watch." },
              { value: "players", label: "The players", text: "Share the pool's invite link. Each person joins and puts a name on the squares they want." },
            ]}
          />
        </SettingRow>
        {s.entry === "players" && (
          <SettingRow label="Limit squares per player" hint={s.max_per_entry ? `Each player can take up to ${s.max_per_entry}.` : "Anyone can take as many as they like."}>
            <div className="flex items-center gap-2">
              {s.max_per_entry !== null && (
                <input
                  type="number" min={1} max={100} aria-label="Most squares per player" value={s.max_per_entry}
                  onChange={(e) => setS((p) => ({ ...p, max_per_entry: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }))}
                  className={`${settingInput} w-20 text-center tabular-nums`}
                />
              )}
              <Toggle label="Limit squares per player" checked={s.max_per_entry !== null} onChange={(v) => setS((p) => ({ ...p, max_per_entry: v ? 5 : null }))} />
            </div>
          </SettingRow>
        )}
        <SettingRow label="Price per square" hint={s.price > 0 ? `A full board is a $${full.toLocaleString("en-US")} pot. The site shows the pot; it doesn't collect money.` : "Free squares: no pot is shown."}>
          <div className="flex items-center gap-1.5">
            <span className="text-muted">$</span>
            <input
              type="number" min={0} step={1} aria-label="Price per square" value={s.price}
              onChange={(e) => setS((p) => ({ ...p, price: Math.max(0, Number(e.target.value) || 0) }))}
              className={`${settingInput} w-28 text-center tabular-nums`}
            />
          </div>
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="The numbers" description="The digits 0-9 along the top and side. They're set on Commissioner → Board once the squares are filled, and that locks the board.">
        <SettingRow label="Numbers are" stack>
          <OptionCards
            ariaLabel="How the numbers are set"
            value={s.numbers}
            onChange={(v) => setS((p) => ({ ...p, numbers: v }))}
            options={[
              { value: "random", label: "Drawn at random", text: "The usual way: nobody knows their numbers until the board is full." },
              { value: "ordered", label: "In order, 0 to 9", text: "Everyone can see which numbers a square has when they choose it." },
              { value: "manual", label: "Typed in by you", text: "For numbers drawn somewhere else, like a board on the wall." },
            ]}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Payouts" description="How the pot is split between the four scores that win.">
        <SettingRow label="Split" stack>
          <OptionCards
            ariaLabel="Payout split"
            value={custom ? "custom" : presetId}
            onChange={(id) => {
              if (id === "custom") return setCustom(true);
              setCustom(false);
              const p = PAYOUT_PRESETS.find((x) => x.id === id);
              if (p) setS((prev) => ({ ...prev, payouts: [...p.payouts] as SquaresSettings["payouts"] }));
            }}
            options={[...PAYOUT_PRESETS.map((p) => ({ value: p.id, label: p.label, text: p.text })), { value: "custom", label: "Custom", text: "Set your own percentages." }]}
          />
        </SettingRow>
        {custom && (
          <SettingRow stack label="Percent of the pot" hint="These have to add up to 100.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {QUARTERS.map((q, i) => (
                <label key={q} className="flex flex-col items-center gap-1 rounded-xl bg-bg p-2">
                  <span className="text-xs font-semibold text-muted">{q}</span>
                  <input
                    type="number" min={0} max={100} step={0.5} aria-label={`${q} percent`} value={s.payouts[i]}
                    onChange={(e) => setS((p) => ({ ...p, payouts: p.payouts.map((v, j) => (j === i ? Math.max(0, Math.min(100, Number(e.target.value) || 0)) : v)) as SquaresSettings["payouts"] }))}
                    className="h-9 w-full rounded-lg bg-surface text-center text-[15px] font-semibold tabular-nums text-accent outline-none focus:ring-2 focus:ring-accent"
                  />
                </label>
              ))}
            </div>
          </SettingRow>
        )}
        {s.price > 0 && !problem && (
          <SettingRow stack label="On a full board" hint={QUARTERS.map((q, i) => `${q}: $${((full * s.payouts[i]) / 100).toLocaleString("en-US")}`).join(" · ")}>
            <span />
          </SettingRow>
        )}
      </SettingsSection>
    </div>
  );
}
