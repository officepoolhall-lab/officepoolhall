import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { LinkButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvite } from "./AcceptInvite";

export const metadata: Metadata = { title: "Co-manage an entry" };

/** A co-manager invite link: say whose entry it is, then accept (signed-out visitors sign in first). */
export default async function ComanagePage({ params }: PageProps<"/comanage/[token]">) {
  const { token } = await params;
  await requireUser(`/comanage/${token}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("comanager_invite_info", { p_token: token });
  const info = data?.[0];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-sm px-4 py-16 text-center">
        {!info ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">That link isn&apos;t valid</h1>
            <p className="mt-1 text-sm text-muted">Ask the player for a new co-manager link.</p>
            <LinkButton href="/pools" kind="secondary" className="mt-6">My pools</LinkButton>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Co-manage {info.owner_name}&apos;s entry?</h1>
            <p className="mt-1 text-sm text-muted">
              In <strong className="font-semibold text-ink">{info.pool_name}</strong>. You&apos;ll be able to make and change their picks,
              with the same locks. You can&apos;t also have your own entry in this pool.
            </p>
            {info.usable ? (
              <AcceptInvite token={token} />
            ) : (
              <>
                <p className="mt-4 text-sm text-loss">This link has been used or has expired. Ask for a new one.</p>
                <LinkButton href="/pools" kind="secondary" className="mt-6">My pools</LinkButton>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
