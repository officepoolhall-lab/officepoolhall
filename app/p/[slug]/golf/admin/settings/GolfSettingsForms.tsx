"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "@/components/ActionForm";
import { OptionCards, Segmented, SettingRow, SettingsSection, Toggle, settingInput } from "@/components/SettingsUI";

// The golf pools' settings, in the same layout as the other pools': one card per topic, a plain
// question per setting. The form field names are what the save actions read.

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

function PoolDetails({ name, fee }: { name: string; fee: number }) {
  return (
    <SettingsSection title="Pool details" description="The name players see, and the entry fee for your records.">
      <SettingRow label="Pool name">
        <input name="name" aria-label="Pool name" defaultValue={name} maxLength={80} required className={`${settingInput} w-full sm:w-72`} />
      </SettingRow>
      <SettingRow label="Entry fee">
        <div className="flex items-center gap-1.5">
          <span className="text-muted">$</span>
          <input name="entry_fee" type="number" min={0} step="1" aria-label="Entry fee" defaultValue={fee} className={`${settingInput} w-28 text-center tabular-nums`} />
        </div>
      </SettingRow>
    </SettingsSection>
  );
}

function SaveBar() {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-bg/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <SubmitButton kind="accent" className="w-full sm:w-auto">Save settings</SubmitButton>
    </div>
  );
}

/** One-and-Done: the built-in rules, and what a week with no pick earns. */
export function OneAndDoneSettings({ action, name, fee, missed }: { action: Action; name: string; fee: number; missed: "zero" | "lowest" }) {
  const [rule, setRule] = useState(missed);
  return (
    <ActionForm action={action} className="space-y-4">
      <PoolDetails name={name} fee={fee} />
      <SettingsSection title="How it works" description="Every One-and-Done pool plays by these rules.">
        <ul className="list-disc space-y-1 py-3 pl-5 text-sm text-ink">
          <li>One golfer per tournament; each golfer can be used once a season.</li>
          <li>Picks lock at the tournament&apos;s first tee time, and everyone&apos;s picks show then.</li>
          <li>Standings are each entry&apos;s total prize money for the season (ESPN&apos;s official earnings).</li>
          <li>A missed cut or withdrawal earns $0 that week, and the golfer still counts as used.</li>
        </ul>
      </SettingsSection>
      <SettingsSection title="Missed picks" description="Changes the standings for the whole season, including weeks already played.">
        <SettingRow label="A week with no pick earns" stack>
          <OptionCards
            ariaLabel="A week with no pick earns"
            name="missed_pick"
            value={rule}
            onChange={setRule}
            options={[
              { value: "zero", label: "$0" },
              { value: "lowest", label: "The week's lowest", text: "The least prize money any entry earned that week." },
            ]}
          />
        </SettingRow>
      </SettingsSection>
      <p className="text-sm text-muted">Payouts, tiebreakers and anything else players should know: post them on the Message Board.</p>
      <SaveBar />
    </ActionForm>
  );
}

export type MajorsFormSettings = {
  contest: "tiers" | "salary";
  omit: { count: number; by: "odds" | "rank" };
  standings: "cumulative" | "each";
  tiers: { count: number; counting: number; sizes: number[]; picks: number[]; scoring: "to_par" | "earnings"; source: "rank" | "odds" | "blend" | "custom"; rankWeight: number };
  salary: { budget: number; roster: number; rankWeight: number; source: "blend" | "custom" };
};

/** Majors and single-tournament pools: the contest, standings, and the chosen contest's rules. */
export function MajorsSettings({
  action,
  name,
  fee,
  s,
  single,
}: {
  action: Action;
  name: string;
  fee: number;
  s: MajorsFormSettings;
  /** A pool on one tournament: no standings choice. */
  single: boolean;
}) {
  const [contest, setContest] = useState(s.contest);
  const [standings, setStandings] = useState(s.standings);
  const [scoring, setScoring] = useState(s.tiers.scoring);
  const [source, setSource] = useState(s.tiers.source);
  const [salarySource, setSalarySource] = useState(s.salary.source);
  const [omitOn, setOmitOn] = useState(s.omit.count > 0);
  const [omitCount, setOmitCount] = useState(s.omit.count || 10);
  const [omitBy, setOmitBy] = useState(s.omit.by);
  const picked = s.tiers.picks.reduce((a, b) => a + b, 0);

  return (
    <ActionForm action={action} className="space-y-4">
      <PoolDetails name={name} fee={fee} />

      <SettingsSection title="Contest" description="Choose before picks open: each tournament's field is built for the contest type.">
        <SettingRow label="Contest type" stack>
          <OptionCards
            ariaLabel="Contest type"
            name="contest"
            value={contest}
            onChange={setContest}
            options={[
              { value: "tiers", label: "Tiers", text: "Pick golfers from each tier." },
              { value: "salary", label: "Salary Cap", text: "Build a roster under a budget, fantasy scoring." },
            ]}
          />
        </SettingRow>
        {!single && (
          <SettingRow label="Standings" stack>
            <OptionCards
              ariaLabel="Standings"
              name="standings"
              value={standings}
              onChange={setStandings}
              options={[
                { value: "cumulative", label: "One total", text: "Added up across the pool's majors." },
                { value: "each", label: "Each major on its own", text: "Separate standings for every major." },
              ]}
            />
          </SettingRow>
        )}
        <SettingRow
          label="Leave out the top golfers"
          hint={
            omitOn
              ? `The ${omitCount} favorites ${omitBy === "odds" ? "by odds to win" : "by world rank"} aren't in the field, so nobody can pick them. Applies when you build a tournament's field.`
              : "Take the favorites out of the field, so lineups have to dig deeper."
          }
        >
          <Toggle label="Leave out the top golfers" checked={omitOn} onChange={setOmitOn} />
        </SettingRow>
        {omitOn && (
          <SettingRow label="Golfers to leave out">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Top</span>
              <input
                type="number" min={1} max={50} aria-label="How many to leave out" value={omitCount}
                onChange={(e) => setOmitCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className={`${settingInput} w-20 text-center tabular-nums`}
              />
              <Segmented
                ariaLabel="Leave out by"
                value={omitBy}
                onChange={setOmitBy}
                options={[
                  { value: "odds", label: "Odds to win" },
                  { value: "rank", label: "World rank" },
                ]}
              />
            </div>
          </SettingRow>
        )}
      </SettingsSection>
      {/* Hidden fields sit outside the cards (their rows are separated by lines). */}
      {omitOn && <input type="hidden" name="omit_on" value="on" />}
      <input type="hidden" name="omit_count" value={omitCount} />
      <input type="hidden" name="omit_by" value={omitBy} />
      {single && <input type="hidden" name="standings" value={standings} />}
      <input type="hidden" name="tier_picks" value={s.tiers.picks.join(",")} />
      {source !== "blend" && <input type="hidden" name="tier_rank_weight" value={Math.round(s.tiers.rankWeight * 100)} />}

      {/* Both contests' fields stay in the form (so saving keeps the other's values); only the chosen one shows. */}
      <div className={contest === "tiers" ? "" : "hidden"}>
        <SettingsSection title="Tiers" description="How golfers are split into tiers and how lineups score.">
          <SettingRow label="Number of tiers">
            <select name="tier_count" aria-label="Number of tiers" defaultValue={s.tiers.count} className={settingInput}>
              <option value={4}>4 tiers: 2 golfers from each</option>
              <option value={6}>6 tiers: 1 each from Tiers 1–5, 3 from Tier 6</option>
              <option value={8}>8 tiers: 1 golfer from each</option>
            </select>
          </SettingRow>
          <SettingRow label="Golfers who count" hint={`Of the ${picked} picked, the best ones count.`}>
            <input name="counting" type="number" min={1} max={12} aria-label="Golfers who count" defaultValue={s.tiers.counting} className={`${settingInput} w-24 text-center tabular-nums`} />
          </SettingRow>
          <SettingRow label="Golfers in each tier" hint="Tier 1 first, separated by commas. The last tier takes everyone else (0).">
            <input name="tier_sizes" aria-label="Golfers in each tier" defaultValue={s.tiers.sizes.join(", ")} className={`${settingInput} w-44 tabular-nums`} />
          </SettingRow>
          <SettingRow label="Score by" stack hint={scoring === "to_par" ? "A golfer who misses the cut or withdraws counts their own score for the rounds they played." : undefined}>
            <OptionCards
              ariaLabel="Score by"
              name="tier_scoring"
              value={scoring}
              onChange={setScoring}
              options={[
                { value: "to_par", label: "Score to par", text: "Lowest total wins." },
                { value: "earnings", label: "Prize money", text: "Highest total wins." },
              ]}
            />
          </SettingRow>
          <SettingRow label="Build tiers from" stack>
            <OptionCards
              ariaLabel="Build tiers from"
              name="tier_source"
              value={source}
              onChange={setSource}
              options={[
                { value: "blend", label: "Odds and world rank", text: "A blend of the two (below)." },
                { value: "odds", label: "Betting odds", text: "DraftKings odds only." },
                { value: "rank", label: "World rankings", text: "Official world golf rankings only." },
                { value: "custom", label: "By hand", text: "Start from world rank and move golfers yourself." },
              ]}
            />
          </SettingRow>
          {source === "blend" && (
            <SettingRow label="World rank's share of the blend" hint="The rest comes from the odds. 20 means 80% odds, 20% world rank.">
              <div className="flex items-center gap-1.5">
                <input name="tier_rank_weight" type="number" min={0} max={100} step={5} aria-label="World rank's share" defaultValue={Math.round(s.tiers.rankWeight * 100)} className={`${settingInput} w-24 text-center tabular-nums`} />
                <span className="text-muted">%</span>
              </div>
            </SettingRow>
          )}
        </SettingsSection>
      </div>

      <div className={contest === "salary" ? "" : "hidden"}>
        <SettingsSection title="Salary Cap" description="Rosters, budget and how salaries are set.">
          <SettingRow label="Budget">
            <div className="flex items-center gap-1.5">
              <span className="text-muted">$</span>
              <input name="budget" type="number" min={1000} step={500} aria-label="Budget" defaultValue={s.salary.budget} className={`${settingInput} w-32 text-center tabular-nums`} />
            </div>
          </SettingRow>
          <SettingRow label="Golfers per roster">
            <input name="roster" type="number" min={1} max={12} aria-label="Golfers per roster" defaultValue={s.salary.roster} className={`${settingInput} w-24 text-center tabular-nums`} />
          </SettingRow>
          <SettingRow label="Salaries" stack>
            <OptionCards
              ariaLabel="Salaries"
              name="salary_source"
              value={salarySource}
              onChange={setSalarySource}
              options={[
                { value: "blend", label: "Formula", text: "From world rank and odds, $4,000–$10,000. You can still edit any salary." },
                { value: "custom", label: "By hand", text: "Start from the formula and set them yourself." },
              ]}
            />
          </SettingRow>
          <SettingRow label="World rank's share of salary" hint="The rest comes from the odds. 50 is an even mix.">
            <div className="flex items-center gap-1.5">
              <input name="rank_weight" type="number" min={0} max={100} step={5} aria-label="World rank's share of salary" defaultValue={Math.round(s.salary.rankWeight * 100)} className={`${settingInput} w-24 text-center tabular-nums`} />
              <span className="text-muted">%</span>
            </div>
          </SettingRow>
          <div className="py-3 text-xs text-muted">
            Scoring follows DraftKings: double eagle +13, eagle +8, birdie +3, par +0.5, bogey −0.5, double bogey or worse −1; +3 for three birdies in a row (once a
            round), +3 for a bogey-free round, +5 for all four rounds under 70, +5 for a hole in one; finishing place from 30 points for 1st down to 1 for 41st–50th.
          </div>
        </SettingsSection>
      </div>

      <p className="text-sm text-muted">Picks lock at each tournament&apos;s first tee time. Payouts and tiebreakers: post them on the Message Board.</p>
      <SaveBar />
    </ActionForm>
  );
}
