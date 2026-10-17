import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My pools" };

export default async function PoolsPage() {
  const user = await requireUser("/pools");
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("pool_members")
    .select("role, paid, pool:pools!inner ( name, slug, sport, season, entry_fee )")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <PageTitle sub={user.email}>My pools</PageTitle>
        {memberships?.length ? (
          <ul className="space-y-3">
            {memberships.map((m) => (
              <li key={m.pool.slug}>
                <Link href={`/p/${m.pool.slug}`}>
                  <Card className="flex items-center gap-4 p-4 transition hover:border-felt">
                    <span className="grid size-11 place-items-center rounded-full bg-felt font-display text-sm font-bold uppercase text-brass">
                      {m.pool.sport === "ncaab" ? "CBB" : "CFB"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{m.pool.name}</span>
                      <span className="text-sm text-muted">
                        {m.pool.season}–{String(m.pool.season + 1).slice(2)}
                        {m.role === "commissioner" && " · Commissioner"}
                        {!m.paid && Number(m.pool.entry_fee) > 0 && " · Unpaid"}
                      </span>
                    </span>
                    <span className="text-muted">›</span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>You&apos;re not in any pools yet. Ask your commissioner for an invite link, or start one.</Empty>
        )}
        <LinkButton href="/pools/new" kind="ghost" className="mt-6 w-full">
          Start a new pool
        </LinkButton>
      </main>
    </>
  );
}
