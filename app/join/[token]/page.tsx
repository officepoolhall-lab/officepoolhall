import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Logo } from "@/components/Logo";
import { LinkButton } from "@/components/ui";
import { getUser, requireUser } from "@/lib/auth";
import { getInvitePreview } from "@/lib/invitePreview";
import { createClient } from "@/lib/supabase/server";

/** The link preview: "Join Saturday Survivors" with the pool's type. */
export async function generateMetadata({ params }: PageProps<"/join/[token]">): Promise<Metadata> {
  const { token } = await params;
  const invite = await getInvitePreview(token);
  if (!invite) return { title: "Join a pool" };
  const title = invite.guest ? `Follow ${invite.poolName}` : `Join ${invite.poolName}`;
  const description = invite.guest
    ? `You're invited to follow ${invite.poolName}, a ${invite.poolType} on The Office Pool Hall.`
    : `You're invited to join ${invite.poolName}, a ${invite.poolType} on The Office Pool Hall.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: false },
  };
}

export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const next = `/join/${token}`;

  // Signed out: say which pool the link is for, then sign in and come back here to join.
  // (Rendered rather than redirected so the link preview can read this page.)
  if (!(await getUser())) {
    const invite = await getInvitePreview(token);
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12 text-center">
        <div className="mb-8">
          <Logo />
        </div>
        <div>
          {invite ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {invite.guest ? "You're invited to follow" : "You're invited to join"}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.03em]">{invite.poolName}</h1>
              <p className="mt-1 text-sm text-muted">{invite.poolType}</p>
              {invite.usable ? (
                <LinkButton href={`/login?next=${encodeURIComponent(next)}`} className="mt-6">
                  Sign in to {invite.guest ? "follow" : "join"}
                </LinkButton>
              ) : (
                <p className="mt-6 text-sm text-loss">This invite link has expired. Ask the commissioner for a new one.</p>
              )}
            </>
          ) : (
            <>
              <h1 className="text-xl font-extrabold tracking-[-0.03em]">That invite link isn&apos;t valid</h1>
              <p className="mt-1 text-sm text-muted">Check the link, or ask the commissioner for a new one.</p>
            </>
          )}
        </div>
      </main>
    );
  }

  await requireUser(next);
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("join_pool", { p_token: token });
  if (slug) redirect(`/p/${slug}`);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-sm px-4 py-16 text-center">
        <h1 className="text-xl font-extrabold tracking-[-0.03em]">Couldn&apos;t join</h1>
        <p className="mt-1 text-sm text-muted">{error?.message ?? "Something went wrong."}</p>
        <LinkButton href="/pools" kind="secondary" className="mt-6">My pools</LinkButton>
      </main>
    </>
  );
}
