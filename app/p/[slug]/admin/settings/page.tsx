import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingsFields } from "@/components/SettingsFields";
import { Field, Panel, SectionLabel, inputClass } from "@/components/ui";
import { requireCommissioner } from "@/lib/pool";
import { saveSettings } from "../actions";

export const metadata: Metadata = { title: "Pool settings" };

// Inputs sit on a bg-surface panel, so they take the page color to stay visible.
const field = inputClass.replace("bg-surface", "bg-bg");

export default async function SettingsPage({ params }: PageProps<"/p/[slug]/admin/settings">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  const { count } = await ctx.supabase
    .from("slates").select("*", { count: "exact", head: true }).eq("pool_id", ctx.pool.id).neq("status", "draft");

  return (
    <ActionForm action={saveSettings.bind(null, slug)} className="space-y-4">
      <Panel className="grid gap-4 p-4 sm:grid-cols-2">
        <SectionLabel className="sm:col-span-2">Pool</SectionLabel>
        <Field label="Pool name">
          <input name="name" defaultValue={ctx.pool.name} className={field} />
        </Field>
        <Field label="Entry fee">
          <input name="entry_fee" type="number" min={0} defaultValue={Number(ctx.pool.entry_fee)} className={`${field} tabular-nums`} />
        </Field>
      </Panel>
      <Panel className="p-4">
        <SettingsFields initial={ctx.settings} lockedCore={Boolean(count)} />
      </Panel>
      <SubmitButton kind="primary" className="w-full sm:w-auto">Save settings</SubmitButton>
    </ActionForm>
  );
}
