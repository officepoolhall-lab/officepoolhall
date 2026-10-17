import { AppHeader } from "@/components/AppHeader";
import { PoolNav } from "@/components/PoolNav";
import { getCurrentSlate, getPoolContext } from "@/lib/pool";

export default async function PoolLayout({ children, params }: LayoutProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const current = await getCurrentSlate(ctx);

  return (
    <>
      <AppHeader>
        <span className="hidden max-w-48 truncate text-muted sm:inline">{ctx.pool.name}</span>
      </AppHeader>
      <PoolNav slug={slug} isCommissioner={ctx.isCommissioner} week={current?.week} />
      {/* Bottom padding clears the picks tracker and the home indicator;
          side padding clears the notch in landscape. */}
      <main className="mx-auto w-full max-w-3xl flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4">
        {children}
      </main>
    </>
  );
}
