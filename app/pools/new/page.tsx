import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { PageTitle } from "@/components/ui";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewPoolForm } from "./NewPoolForm";

export const metadata: Metadata = { title: "New pool" };

export default async function NewPoolPage() {
  await requireUser("/pools/new");
  const supabase = await createClient();
  const { data: canCreate } = await supabase.rpc("can_create_pools");
  if (!canCreate) redirect("/pools");
  const now = new Date();
  // College seasons straddle New Year: Jan–Jul belongs to last year's season.
  const defaultSeason = now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <PageTitle sub="You'll be the commissioner. You can tweak rules until the first week opens.">Start a pool</PageTitle>
        <NewPoolForm defaultSeason={defaultSeason} />
      </main>
    </>
  );
}
