import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Card, LinkButton } from "@/components/ui";
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
      <main className="mx-auto w-full max-w-sm px-4 py-12">
        <Card className="space-y-4 p-6 text-center">
          <p className="font-display text-2xl font-bold uppercase">Couldn&apos;t join</p>
          <p className="text-muted">{error?.message ?? "Something went wrong."}</p>
          <LinkButton href="/pools" kind="ghost">My pools</LinkButton>
        </Card>
      </main>
    </>
  );
}
