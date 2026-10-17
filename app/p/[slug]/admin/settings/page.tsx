import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { SettingsFields } from "@/components/SettingsFields";
import { Card, Field, inputClass } from "@/components/ui";
import { requireCommissioner } from "@/lib/pool";
import { saveSettings } from "../actions";

export const metadata: Metadata = { title: "Pool settings" };

export default async function SettingsPage({ params }: PageProps<"/p/[slug]/admin/settings">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  const { count } = await ctx.supabase
    .from("slates").select("*", { count: "exact", head: true }).eq("pool_id", ctx.pool.id).neq("status", "draft");

  return (
    <ActionForm action={saveSettings.bind(null, slug)} className="space-y-4">
          <Card className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Pool name">
              <input name="name" defaultValue={ctx.pool.name} className={inputClass} />
            </Field>
            <Field label="Entry fee">
              <input name="entry_fee" type="number" min={0} defaultValue={Number(ctx.pool.entry_fee)} className={inputClass} />
            </Field>
          </Card>
          <Card className="p-4">
            <SettingsFields initial={ctx.settings} lockedCore={Boolean(count)} />
          </Card>
          <SubmitButton>Save settings</SubmitButton>
    </ActionForm>
  );
}
