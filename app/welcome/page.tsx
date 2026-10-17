import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, inputClass, Wordmark } from "@/components/ui";
import { getProfile, getUser, safeNext } from "@/lib/auth";
import { continueWithName } from "../account/actions";
import { NameFields } from "../account/NameFields";

export const metadata: Metadata = { title: "Your name" };

// One-time step after a new player's first sign-in (requireUser sends them here), so
// standings show real names instead of email addresses. A password is optional here.
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const profile = await getProfile(user.id);
  if (!profile || profile.name_confirmed) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <Wordmark className="text-2xl" />
        <p className="mt-1 text-sm text-muted">What&apos;s your name? It&apos;s how you&apos;ll show up in the standings.</p>
      </div>
      <ActionForm action={continueWithName} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <NameFields first={profile.first_name} last={profile.last_name} autoFocus />
        {/* Lets password managers file the new password under this account. */}
        <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
        <Field label="Password (optional)" hint="Set one to sign in without an emailed code. At least 8 characters, with a letter and a number.">
          <input name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
        </Field>
        <Field label="Confirm password">
          <input name="confirm" type="password" minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
        </Field>
        <SubmitButton className="w-full" pending="Saving…">Continue</SubmitButton>
      </ActionForm>
      <form action="/auth/signout" method="post" className="mt-2 text-center">
        <button className="h-11 text-sm text-muted hover:text-ink">Not {user.email}? Sign out</button>
      </form>
    </main>
  );
}
