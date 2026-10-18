import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PasswordNudge } from "@/components/PasswordNudge";
import { PoolNav } from "@/components/PoolNav";
import { PoolSwitcher } from "@/components/PoolSwitcher";
import { getCurrentSlate, getPoolContext } from "@/lib/pool";

export default async function PoolLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const [current, { data: memberships }] = await Promise.all([
    getCurrentSlate(ctx),
    // The player's other pools, for the switcher in the header.
    ctx.supabase.from("pool_members").select("pool:pools!inner ( name, slug )").eq("user_id", ctx.user.id).order("joined_at", { ascending: false }),
  ]);
  const pools = (memberships ?? []).map((m) => ({ name: m.pool.name, slug: m.pool.slug }));

  return (
    <>
      <AppHeader>
        <div className="hidden sm:block">
          <PoolSwitcher current={{ name: ctx.pool.name, slug: ctx.pool.slug }} pools={pools} />
        </div>
      </AppHeader>
      <PoolNav slug={slug} isCommissioner={ctx.isCommissioner} week={current?.week} />
      {/* Bottom padding clears the picks tracker and the home indicator (less on pages that
          fill the viewport, which have no tracker); side padding clears the notch in landscape.
          Pages that fill the viewport (the Grid) and wide pages (Picks) use the full screen width on desktop. */}
      <main className="group/main mx-auto w-full max-w-5xl has-[[data-fill-viewport]]:max-w-none has-[[data-wide]]:max-w-none flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] has-[[data-fill-viewport]]:pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4">
        <Suspense fallback={null}>
          <PasswordNudge />
        </Suspense>
        {children}
      </main>
    </>
  );
}
