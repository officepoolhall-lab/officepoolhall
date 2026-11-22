import { AppHeader } from "@/components/AppHeader";
import { PageSkeleton, RowsSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl px-4 xl:max-w-6xl 2xl:max-w-7xl py-6">
        <PageSkeleton>
          <RowsSkeleton rows={3} />
        </PageSkeleton>
      </main>
    </>
  );
}
