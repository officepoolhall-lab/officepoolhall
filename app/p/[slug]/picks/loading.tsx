import { GamesSkeleton, PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <GamesSkeleton />
    </PageSkeleton>
  );
}
