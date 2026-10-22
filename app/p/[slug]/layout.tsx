import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PasswordNudge } from "@/components/PasswordNudge";
import { PoolNav } from "@/components/PoolNav";
import { PoolPresence } from "@/components/PoolPresence";
import { PoolSwitcher } from "@/components/PoolSwitcher";
import { PoolTitle } from "@/components/PoolTitle";
import { getCurrentSlate, getPoolContext } from "@/lib/pool";

export default async function PoolLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const [current, { data: memberships }, { data: managed }, { data: guestOf }] = await Promise.all([
    getCurrentSlate(ctx),
    // The player's other pools, for the switcher in the header, plus entries they co-manage
    // and pools they view as a guest.
    ctx.supabase.from("pool_members").select("pool:pools!inner ( name, slug )").eq("user_id", ctx.user.id).order("joined_at", { ascending: false }),
    ctx.supabase.rpc("my_comanaged_entries"),
    ctx.supabase.rpc("my_guest_pools"),
  ]);
  const pools = [
    ...(memberships ?? []).map((m) => ({ name: m.pool.name, slug: m.pool.slug })),
    ...(managed ?? []).map((m: { pool_name: string; slug: string }) => ({ name: m.pool_name, slug: m.slug })),
    ...((guestOf ?? []) as { name: string; slug: string }[]).map((g) => ({ name: g.name, slug: g.slug })),
  ];

  return (
    // Reports the viewer as on the site while any of this pool's pages is open (Roster's green dots).
    <PoolPresence poolId={ctx.pool.id} userId={ctx.user.id}>
      <AppHeader>
        <div className="hidden sm:block">
          <PoolSwitcher current={{ name: ctx.pool.name, slug: ctx.pool.slug }} pools={pools} />
        </div>
      </AppHeader>
      <PoolTitle slug={slug} name={ctx.pool.name} />
      <PoolNav slug={slug} isCommissioner={ctx.isCommissioner} isGuest={ctx.isGuest} week={current?.week} />
      {/* Bottom padding clears the picks tracker and the home indicator (less on pages that
          fill the viewport, which have no tracker); side padding clears the notch in landscape.
          Pages that fill the viewport (the Grid) and wide pages (Picks) use the full screen width on desktop. */}
      <main className="group/main mx-auto w-full max-w-5xl has-[[data-fill-viewport]]:max-w-none has-[[data-wide]]:max-w-none flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] has-[[data-fill-viewport]]:pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4">
        <Suspense fallback={null}>
          <PasswordNudge />
        </Suspense>
        {ctx.isGuest && (
          <p className="mb-4 rounded-lg bg-surface px-3 py-2 text-sm text-muted">
            <span className="font-semibold text-ink">Guest view.</span> You can see everything in this pool but can&apos;t make picks or post.
          </p>
        )}
        {children}
      </main>
    </PoolPresence>
  );
}
