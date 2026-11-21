import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewPoolForm } from "./NewPoolForm";
import { RequestAccess } from "./RequestAccess";

export const metadata: Metadata = { title: "New pool" };

export default async function NewPoolPage({ searchParams }: PageProps<"/pools/new">) {
  const user = await requireUser("/pools/new");
  const { type } = await searchParams;
  const supabase = await createClient();
  const { data: canCreate } = await supabase.rpc("can_create_pools");
  if (!canCreate) {
    // Not approved to start pools yet: ask to run one instead of a dead end.
    const { data: request } = await supabase
      .from("pool_creator_requests")
      .select("pools, group_size, message, created_at")
      .eq("user_id", user.id)
      .maybeSingle();
    return (
      <>
        <AppHeader />
        <main className="mx-auto w-full max-w-5xl px-4 py-6">
          <PageTitle sub="New pools are invite-only for a little while longer.">Start a pool</PageTitle>
          <RequestAccess email={user.email} request={request} />
        </main>
      </>
    );
  }
  const now = new Date();
  // College seasons straddle New Year: Jan–Jul belongs to last year's season.
  const defaultSeason = now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <PageTitle sub="You'll be the commissioner. You can tweak rules until the first week opens.">Start a pool</PageTitle>
        {/* ?type=nfl_pickem (etc.) opens with that template chosen. */}
        <NewPoolForm defaultSeason={defaultSeason} initial={typeof type === "string" ? type : undefined} />
      </main>
    </>
  );
}
