import { Bar, PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <Bar className="h-80 rounded-xl" />
    </PageSkeleton>
  );
}
