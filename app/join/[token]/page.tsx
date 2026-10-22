import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { LinkButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  await requireUser(`/join/${token}`);
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
