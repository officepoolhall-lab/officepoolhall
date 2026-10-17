import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, inputClass, PageTitle, Panel, SectionLabel } from "@/components/ui";
import { getProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setPassword, updateName } from "./actions";
import { NameFields } from "./NameFields";

export const metadata: Metadata = { title: "Account" };

// Inputs share bg-surface with the panel, so inside panels they drop to the page background.
const panelFields = "[&_input]:bg-bg";

export default async function AccountPage() {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const [profile, { data: hasPassword }] = await Promise.all([getProfile(user.id), supabase.rpc("has_password")]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
        <PageTitle sub={user.email}>Account</PageTitle>

        <Panel className={`p-4 ${panelFields}`}>
          <SectionLabel className="mb-3">Your name</SectionLabel>
          <ActionForm action={updateName} className="space-y-3">
            <NameFields first={profile?.first_name} last={profile?.last_name} />
            <p className="text-xs text-muted">Shown to everyone in your pools.</p>
            <SubmitButton kind="secondary" className="w-full sm:w-auto">Save name</SubmitButton>
          </ActionForm>
        </Panel>

        <Panel className={`p-4 ${panelFields}`}>
          <SectionLabel className="mb-3">{hasPassword ? "Change password" : "Set a password"}</SectionLabel>
          <ActionForm action={setPassword} className="space-y-3">
            {/* Lets password managers file the new password under this account. */}
            <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="New password" hint="At least 8 characters, with a letter and a number.">
                <input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
              </Field>
              <Field label="Confirm password">
                <input name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
              </Field>
            </div>
            <p className="text-xs text-muted">
              Optional. {hasPassword ? "You" : "With a password you"} can sign in without waiting for an emailed code. The code
              still works any time.
            </p>
            <SubmitButton kind="secondary" className="w-full sm:w-auto">{hasPassword ? "Change password" : "Set password"}</SubmitButton>
          </ActionForm>
        </Panel>
      </main>
    </>
  );
}
