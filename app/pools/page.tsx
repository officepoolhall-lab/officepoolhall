import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ChevronIcon, Empty, LinkButton, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My pools" };

export default async function PoolsPage() {
  const user = await requireUser("/pools");
  const supabase = await createClient();
  const [{ data: memberships }, { data: canCreate }] = await Promise.all([
    supabase
      .from("pool_members")
      .select("role, paid, pool:pools!inner ( name, slug, sport, season, entry_fee )")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false }),
    // Only approved commissioners can start pools (enforced in create_pool too).
    supabase.rpc("can_create_pools"),
  ]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <PageTitle sub={user.email}>My pools</PageTitle>
        {memberships?.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {memberships.map((m) => (
              <li key={m.pool.slug}>
                <Link href={`/p/${m.pool.slug}`} className="flex min-h-16 items-center gap-3 py-3 transition hover:opacity-80">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-xs font-medium text-muted">
                    {m.pool.sport === "ncaab" ? "CBB" : "CFB"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{m.pool.name}</span>
                    <span className="block text-sm text-muted tabular-nums">
                      {m.pool.season}–{String(m.pool.season + 1).slice(2)}
                      {m.role === "commissioner" && " · Commissioner"}
                      {!m.paid && Number(m.pool.entry_fee) > 0 && " · Unpaid"}
                    </span>
                  </span>
                  <ChevronIcon className="size-4 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            You&apos;re not in any pools yet. Ask your commissioner for an invite link{canCreate ? ", or start one" : ""}.
          </Empty>
        )}
        {canCreate && (
          <LinkButton href="/pools/new" kind="secondary" className="mt-6 w-full">
            Start a new pool
          </LinkButton>
        )}
      </main>
    </>
  );
}
