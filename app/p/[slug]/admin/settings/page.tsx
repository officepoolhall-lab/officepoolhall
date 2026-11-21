import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingsFields } from "@/components/SettingsFields";
import { SettingRow, SettingsSection, settingInput } from "@/components/SettingsUI";
import { requireCommissioner } from "@/lib/pool";
import { saveSettings } from "../actions";
import { savePickXSettings } from "../../pickx/actions";
import { PickXRulesFields } from "@/components/pickx/PickXRulesFields";
import { getBracket } from "@/lib/brackets";
import { isPickX, pickXSettings } from "@/lib/pickx";

export const metadata: Metadata = { title: "Pool settings" };

/** The pool's name and entry fee, then its rules by topic (components/SettingsFields). */
export default async function SettingsPage({ params }: PageProps<"/p/[slug]/admin/settings">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  if (isPickX(ctx.pool.settings)) return <PickXSettingsPage slug={slug} ctx={ctx} />;
  const { count } = await ctx.supabase
    .from("slates").select("*", { count: "exact", head: true }).eq("pool_id", ctx.pool.id).neq("status", "draft");

  return (
    <ActionForm action={saveSettings.bind(null, slug)} className="space-y-4 pb-20">
      <SettingsSection title="Pool details" description="The name players see, and the entry fee for your records.">
        <SettingRow label="Pool name">
          <input name="name" aria-label="Pool name" defaultValue={ctx.pool.name} className={`${settingInput} w-full sm:w-72`} />
        </SettingRow>
        <SettingRow label="Entry fee">
          <div className="flex items-center gap-1.5">
            <span className="text-muted">$</span>
            <input name="entry_fee" type="number" min={0} aria-label="Entry fee" defaultValue={Number(ctx.pool.entry_fee)} className={`${settingInput} w-28 text-center tabular-nums`} />
          </div>
        </SettingRow>
      </SettingsSection>
      <SettingsFields initial={ctx.settings} lockedCore={Boolean(count)} />
      {/* Always in reach on a long page. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-bg/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <SubmitButton kind="accent" className="w-full sm:w-auto">Save settings</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** An NCAA Pick X pool: its name and fee, then the Pick X rules (teams, scoring, limits). */
async function PickXSettingsPage({ slug, ctx }: { slug: string; ctx: Awaited<ReturnType<typeof requireCommissioner>> }) {
  const bracket = await getBracket(ctx);
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of the lock
  const locked = bracket ? Date.parse(bracket.lockAt) <= Date.now() : false;
  return (
    <ActionForm action={savePickXSettings.bind(null, slug)} className="space-y-4">
      <SettingsSection title="Pool details" description="The name players see, and the entry fee for your records.">
        <SettingRow label="Pool name">
          <input name="name" aria-label="Pool name" defaultValue={ctx.pool.name} className={`${settingInput} w-full sm:w-72`} />
        </SettingRow>
        <SettingRow label="Entry fee">
          <div className="flex items-center gap-1.5">
            <span className="text-muted">$</span>
            <input name="entry_fee" type="number" min={0} aria-label="Entry fee" defaultValue={Number(ctx.pool.entry_fee)} className={`${settingInput} w-28 text-center tabular-nums`} />
          </div>
        </SettingRow>
      </SettingsSection>
      <PickXRulesFields initial={pickXSettings(ctx.pool.settings)} locked={locked} />
      <p className="text-sm text-muted">The tournament field, the lock time and each game&apos;s winner are set on Commissioner → Bracket.</p>
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-bg/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <SubmitButton kind="accent" className="w-full sm:w-auto">Save settings</SubmitButton>
      </div>
    </ActionForm>
  );
}
