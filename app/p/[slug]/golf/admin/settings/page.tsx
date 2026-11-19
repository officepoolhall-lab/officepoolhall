import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, Panel, SectionLabel, inputClass } from "@/components/ui";
import { getGolfContext, golfFormat, missedPickRule } from "@/lib/golf";
import { majorsSettings } from "@/lib/golfMajors";
import { saveGolfSettings, saveMajorsSettings } from "../actions";

export const metadata: Metadata = { title: "Pool settings" };

// Inputs sit on a bg-surface panel, so they take the page color to stay visible.
const field = inputClass.replace("bg-surface", "bg-bg");

/** The pool's name and entry fee, and the rules every golf pool plays by. Payouts and other notes go on the Message Board. */
export default async function GolfSettingsPage({ params }: PageProps<"/p/[slug]/golf/admin/settings">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  if (golfFormat(ctx.pool) === "majors") return <MajorsSettingsForm slug={slug} pool={ctx.pool} />;
  const missed = missedPickRule(ctx.pool);

  return (
    <ActionForm action={saveGolfSettings.bind(null, slug)} className="space-y-4">
      <Panel className="grid gap-4 p-4 sm:grid-cols-2">
        <SectionLabel className="sm:col-span-2">Pool</SectionLabel>
        <Field label="Contest name">
          <input name="name" defaultValue={ctx.pool.name} maxLength={80} required className={field} />
        </Field>
        <Field label="Entry fee">
          <input name="entry_fee" type="number" min={0} step="1" defaultValue={Number(ctx.pool.entry_fee)} className={`${field} tabular-nums`} />
        </Field>
      </Panel>

      <Panel className="p-4">
        <SectionLabel>Rules</SectionLabel>
        <p className="mt-1 text-sm text-muted">Every One-and-Done pool plays by these; they&apos;re built into the site.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>One golfer per tournament; each golfer can be used once per season.</li>
          <li>Picks lock at the tournament&apos;s first tee time. Other entries&apos; picks show once it locks.</li>
          <li>Standings are the season&apos;s total prize money from each pick (ESPN&apos;s official earnings).</li>
          <li>A missed cut or a withdrawal earns $0 that week; the golfer still counts as used.</li>
        </ul>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">A week with no pick earns</legend>
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="missed_pick" value="zero" defaultChecked={missed === "zero"} className="size-4 accent-[var(--accent)]" />
            $0
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="missed_pick" value="lowest" defaultChecked={missed === "lowest"} className="size-4 accent-[var(--accent)]" />
            The lowest prize money any entry earned that week
          </label>
          <p className="text-xs text-muted">Changes the standings for the whole season, including weeks already played.</p>
        </fieldset>
        <p className="mt-4 text-sm text-muted">Payouts, tiebreakers and anything else players should know: post them on the Message Board.</p>
      </Panel>
      <SubmitButton kind="primary" className="w-full sm:w-auto">
        Save settings
      </SubmitButton>
    </ActionForm>
  );
}

const radio = "size-4 accent-[var(--accent)]";
function Choice({ name, value, checked, children }: { name: string; value: string; checked: boolean; children: ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="radio" name={name} value={value} defaultChecked={checked} className={radio} />
      {children}
    </label>
  );
}

/** A Majors pool: contest type, standings, and the tier or salary cap rules. */
function MajorsSettingsForm({ slug, pool }: { slug: string; pool: { name: string; entry_fee: unknown; settings: unknown } }) {
  const s = majorsSettings(pool.settings);
  return (
    <ActionForm action={saveMajorsSettings.bind(null, slug)} className="space-y-4">
      <Panel className="grid gap-4 p-4 sm:grid-cols-2">
        <SectionLabel className="sm:col-span-2">Pool</SectionLabel>
        <Field label="Contest name">
          <input name="name" defaultValue={pool.name} maxLength={80} required className={field} />
        </Field>
        <Field label="Entry fee">
          <input name="entry_fee" type="number" min={0} step="1" defaultValue={Number(pool.entry_fee)} className={`${field} tabular-nums`} />
        </Field>
      </Panel>

      <Panel className="grid gap-4 p-4 sm:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-semibold">Contest</legend>
          <Choice name="contest" value="tiers" checked={s.contest === "tiers"}>Tiers: one golfer per pick from each tier</Choice>
          <Choice name="contest" value="salary" checked={s.contest === "salary"}>Salary Cap: a roster under a budget, DFS scoring</Choice>
          <p className="text-xs text-muted">Choose before the first major&apos;s picks open: each major&apos;s field is built for the contest type.</p>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">Standings</legend>
          <Choice name="standings" value="cumulative" checked={s.standings === "cumulative"}>Cumulative: one total across the pool&apos;s majors</Choice>
          <Choice name="standings" value="each" checked={s.standings === "each"}>Each major on its own</Choice>
        </fieldset>
      </Panel>

      <Panel className="space-y-4 p-4">
        <SectionLabel>Tiers</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Number of tiers">
            <select name="tier_count" defaultValue={s.tiers.count} className={field}>
              <option value={4}>4 tiers (2 golfers from each)</option>
              <option value={6}>6 tiers (1 each from Tiers 1–5, 3 from Tier 6)</option>
              <option value={8}>8 tiers (1 golfer from each)</option>
            </select>
          </Field>
          <Field label="Golfers who count" hint={`Of the ${s.tiers.picks.reduce((a, b) => a + b, 0)} picked, the best ones count.`}>
            <input name="counting" type="number" min={1} max={12} defaultValue={s.tiers.counting} className={`${field} tabular-nums`} />
          </Field>
          <Field label="Golfers per tier" hint="Tier 1 first; the last tier takes the rest (0). Used when tiers are built.">
            <input name="tier_sizes" defaultValue={s.tiers.sizes.join(", ")} className={`${field} tabular-nums`} />
          </Field>
        </div>
        <input type="hidden" name="tier_picks" value={s.tiers.picks.join(",")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-semibold">Score by</legend>
            <Choice name="tier_scoring" value="to_par" checked={s.tiers.scoring === "to_par"}>Total score to par (lowest wins)</Choice>
            <Choice name="tier_scoring" value="earnings" checked={s.tiers.scoring === "earnings"}>Prize money (highest wins)</Choice>
            <p className="text-xs text-muted">Score to par: a golfer who misses the cut or withdraws takes the worst score of any golfer who made the cut.</p>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">Build tiers from</legend>
            <Choice name="tier_source" value="rank" checked={s.tiers.source === "rank"}>World golf rankings</Choice>
            <Choice name="tier_source" value="odds" checked={s.tiers.source === "odds"}>DraftKings betting odds</Choice>
            <Choice name="tier_source" value="blend" checked={s.tiers.source === "blend"}>Both, blended</Choice>
            <Choice name="tier_source" value="custom" checked={s.tiers.source === "custom"}>Set by hand (starts from world rank)</Choice>
            <div className="mt-2 max-w-60">
              <Field label="World rank share of the blend" hint="Blended tiers only. The rest comes from DraftKings odds. 30 = mostly odds.">
                <input name="tier_rank_weight" type="number" min={0} max={100} step={5} defaultValue={Math.round(s.tiers.rankWeight * 100)} className={`${field} tabular-nums`} />
              </Field>
            </div>
          </fieldset>
        </div>
      </Panel>

      <Panel className="space-y-4 p-4">
        <SectionLabel>Salary Cap</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Budget">
            <input name="budget" type="number" min={1000} step={500} defaultValue={s.salary.budget} className={`${field} tabular-nums`} />
          </Field>
          <Field label="Golfers per roster">
            <input name="roster" type="number" min={1} max={12} defaultValue={s.salary.roster} className={`${field} tabular-nums`} />
          </Field>
          <Field label="World rank share of salary" hint="The rest comes from DraftKings odds. 50 = an even mix.">
            <input name="rank_weight" type="number" min={0} max={100} step={5} defaultValue={Math.round(s.salary.rankWeight * 100)} className={`${field} tabular-nums`} />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Salaries</legend>
          <Choice name="salary_source" value="blend" checked={s.salary.source === "blend"}>Formula from world rank and odds ($4,000–$10,000), editable</Choice>
          <Choice name="salary_source" value="custom" checked={s.salary.source === "custom"}>Set by hand (starts from the formula)</Choice>
        </fieldset>
        <p className="text-xs text-muted">
          Scoring follows DraftKings: double eagle +13, eagle +8, birdie +3, par +0.5, bogey −0.5, double bogey or worse −1; +3 for 3 birdies in a row (once a
          round), +3 bogey-free round, +5 all four rounds under 70, +5 hole in one; finishing place 1st 30 down to 41st–50th 1.
        </p>
      </Panel>

      <p className="text-sm text-muted">Picks lock at each major&apos;s first tee time. Payouts and tiebreakers: post them on the Message Board.</p>
      <SubmitButton kind="primary" className="w-full sm:w-auto">
        Save settings
      </SubmitButton>
    </ActionForm>
  );
}
