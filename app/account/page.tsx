import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, inputClass, PageTitle, SectionLabel } from "@/components/ui";
import { getProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { changeEmail, removeComanager, setPassword, updateName } from "./actions";
import { ComanagerInvite } from "./ComanagerInvite";
import { NameFields } from "./NameFields";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const { email: emailParam } = await searchParams;
  const user = await requireUser("/account");
  const supabase = await createClient();
  const [profile, { data: hasPassword }, { data: memberships }, comanagers, managed, { data: auth }] = await Promise.all([
    getProfile(user.id),
    supabase.rpc("has_password"),
    supabase.from("pool_members").select("pool:pools!inner ( id, name )").eq("user_id", user.id).order("joined_at", { ascending: false }),
    // Co-managers of the player's entries, and entries they co-manage (null until the
    // co-manager migration is in the database; the section is hidden then).
    supabase.rpc("my_entry_comanagers"),
    supabase.rpc("my_comanaged_entries"),
    // The live account record: the current email (the session token can lag a change) and
    // any change still waiting for its confirmation links.
    supabase.auth.getUser(),
  ]);
  const currentEmail = auth.user?.email ?? user.email;
  const pendingEmail = auth.user?.new_email ?? null;
  const coReady = !comanagers.error && !managed.error;
  const myPools = (memberships ?? []).map((m) => ({ id: m.pool.id, name: m.pool.name }));
  const helpers = (comanagers.data ?? []) as { pool_id: string; manager_id: string; manager_name: string }[];
  const running = (managed.data ?? []) as { pool_id: string; pool_name: string; owner_name: string }[];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6">
        <PageTitle sub={currentEmail}>Account</PageTitle>

        <section>
          <SectionLabel className="mb-3">Your name</SectionLabel>
          <ActionForm action={updateName} className="space-y-3">
            <NameFields first={profile?.first_name} last={profile?.last_name} />
            <p className="text-xs text-muted">Shown to everyone in your pools.</p>
            <SubmitButton kind="secondary" className="w-full sm:w-auto">Save name</SubmitButton>
          </ActionForm>
        </section>

        <section>
          <SectionLabel className="mb-3">Email</SectionLabel>
          {/* Back from a confirmation link: one address is confirmed; the change applies once both are. */}
          {emailParam === "confirmed" && (
            <p className="mb-3 rounded-[10px] bg-surface px-3 py-2.5 text-sm text-ink">
              {pendingEmail ? "Confirmed. Now click the link in your other inbox to finish the change." : "Your email is confirmed and up to date."}
            </p>
          )}
          <p className="mb-3 text-sm text-muted">
            You sign in with <strong className="font-semibold text-ink">{currentEmail}</strong>.
            {pendingEmail && (
              <>
                {" "}
                Changing to <strong className="font-semibold text-ink">{pendingEmail}</strong>: waiting for the confirmation links.
              </>
            )}
          </p>
          <ActionForm action={changeEmail} className="space-y-3">
            <Field label="New email">
              <input name="email" type="email" required autoComplete="email" className={inputClass} placeholder="you@example.com" />
            </Field>
            <p className="text-xs text-muted">We&apos;ll email a link to your current address and the new one. The change applies once both are clicked.</p>
            <SubmitButton kind="secondary" className="w-full sm:w-auto">Change email</SubmitButton>
          </ActionForm>
        </section>

        <section>
          <SectionLabel className="mb-3">{hasPassword ? "Change password" : "Set a password"}</SectionLabel>
          <ActionForm action={setPassword} className="space-y-3">
            {/* Lets password managers file the new password under this account. */}
            <input type="email" name="username" autoComplete="username" value={currentEmail} readOnly hidden />
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
        </section>

        {coReady && (myPools.length > 0 || running.length > 0) && (
          <section>
            <SectionLabel className="mb-1">Co-managers</SectionLabel>
            <p className="mb-3 text-xs text-muted">
              A co-manager can make and change picks for your entry, with the same locks as you. They can&apos;t have their own entry in that pool.
            </p>
            <ul className="divide-y divide-line border-y border-line">
              {myPools.map((p) => {
                const mine = helpers.filter((h) => h.pool_id === p.id);
                return (
                  <li key={p.id} className="space-y-2 py-3">
                    <div className="text-[15px] font-semibold">{p.name}</div>
                    {mine.length > 0 ? (
                      <ul className="space-y-1">
                        {mine.map((h) => (
                          <li key={h.manager_id} className="flex items-center gap-3 text-sm">
                            <span className="min-w-0 flex-1 truncate">{h.manager_name}</span>
                            <form action={removeComanager.bind(null, p.id, h.manager_id)}>
                              <button className="min-h-11 text-sm text-loss hover:underline">Remove</button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted">No co-managers yet.</p>
                    )}
                    <ComanagerInvite poolId={p.id} />
                  </li>
                );
              })}
              {running.map((r) => (
                <li key={`co-${r.pool_id}`} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{r.pool_name}</span>
                    <span className="block text-sm text-muted">You co-manage {r.owner_name}&apos;s entry</span>
                  </span>
                  <form action={removeComanager.bind(null, r.pool_id, user.id)}>
                    <button className="min-h-11 text-sm text-loss hover:underline">Step down</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
