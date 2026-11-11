import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, Panel, SectionLabel, inputClass } from "@/components/ui";
import { getGolfContext, missedPickRule } from "@/lib/golf";
import { saveGolfSettings } from "../actions";

export const metadata: Metadata = { title: "Pool settings" };

// Inputs sit on a bg-surface panel, so they take the page color to stay visible.
const field = inputClass.replace("bg-surface", "bg-bg");

/** The pool's name and entry fee, the rules every golf pool plays by, and the commissioner's own notes. */
export default async function GolfSettingsPage({ params }: PageProps<"/p/[slug]/golf/admin/settings">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  const missed = missedPickRule(ctx.pool);
  const note = ((ctx.pool.settings as Record<string, unknown> | null)?.rules_note as string | null) ?? "";

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
        <div className="mt-4">
          <Field label="Your rules and notes (shown to players on Home)">
            <textarea
              name="rules_note"
              defaultValue={note}
              rows={6}
              maxLength={4000}
              placeholder="Payouts, tiebreakers, deadlines for paying, anything else players should know."
              className={`${field} min-h-32 py-2`}
            />
          </Field>
        </div>
      </Panel>
      <SubmitButton kind="primary" className="w-full sm:w-auto">
        Save settings
      </SubmitButton>
    </ActionForm>
  );
}
