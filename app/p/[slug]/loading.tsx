import { Bar, PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="space-y-3">
        <Bar className="h-5 w-48" />
        <div className="grid grid-cols-2 gap-3">
          <Bar className="h-20" />
          <Bar className="h-20" />
        </div>
        <Bar className="h-11 rounded-full" />
      </div>
    </PageSkeleton>
  );
}
