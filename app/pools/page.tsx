import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PasswordNudge } from "@/components/PasswordNudge";
import { ChevronIcon, Empty, LinkButton, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My pools" };

export default async function PoolsPage() {
  const user = await requireUser("/pools");
  const supabase = await createClient();
  const [{ data: memberships }, { data: canCreate }, { data: profile }, { data: managed }, { data: guestOf }] = await Promise.all([
    supabase
      .from("pool_members")
      .select("role, paid, pool:pools!inner ( name, slug, sport, season, entry_fee )")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false }),
    // Only approved commissioners can start pools (enforced in create_pool too).
    supabase.rpc("can_create_pools"),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    // Entries they help run for someone else (co-manager).
    supabase.rpc("my_comanaged_entries"),
    // Pools they can view as a guest.
    supabase.rpc("my_guest_pools"),
  ]);
  const guestPools = (guestOf ?? []) as { slug: string; name: string; sport: string }[];
  const coManaged = (managed ?? []) as { slug: string; pool_name: string; sport: string; season: number; owner_name: string }[];

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <Suspense fallback={null}>
          <PasswordNudge />
        </Suspense>
        {/* The player's name ("First Last"); the email only if no name is set yet. */}
        <PageTitle sub={profile?.display_name?.trim() || user.email}>My pools</PageTitle>
        {memberships?.length || coManaged.length || guestPools.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {(memberships ?? []).map((m) => (
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
            {coManaged.map((m) => (
              <li key={`co-${m.slug}`}>
                <Link href={`/p/${m.slug}`} className="flex min-h-16 items-center gap-3 py-3 transition hover:opacity-80">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-xs font-medium text-muted">
                    {m.sport === "ncaab" ? "CBB" : "CFB"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{m.pool_name}</span>
                    <span className="block text-sm text-muted tabular-nums">
                      {m.season}–{String(m.season + 1).slice(2)} · Co-managing {m.owner_name}&apos;s entry
                    </span>
                  </span>
                  <ChevronIcon className="size-4 text-faint" />
                </Link>
              </li>
            ))}
            {guestPools.map((g) => (
              <li key={`guest-${g.slug}`}>
                <Link href={`/p/${g.slug}`} className="flex min-h-16 items-center gap-3 py-3 transition hover:opacity-80">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-xs font-medium text-muted">
                    {g.sport === "ncaab" ? "CBB" : "CFB"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{g.name}</span>
                    <span className="block text-sm text-muted">Guest · view only</span>
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
