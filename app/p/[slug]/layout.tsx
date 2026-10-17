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
        <span className="hidden max-w-48 truncate text-white/80 sm:inline">{ctx.pool.name}</span>
      </AppHeader>
      <PoolNav slug={slug} isCommissioner={ctx.isCommissioner} week={current?.week} />
      {/* bottom padding clears the phone tab bar (and the picks tracker above it) */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-40 pt-4 sm:pb-12">{children}</main>
    </>
  );
}
