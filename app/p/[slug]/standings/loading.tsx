import { PageSkeleton, RowsSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <RowsSkeleton rows={12} />
    </PageSkeleton>
  );
}
