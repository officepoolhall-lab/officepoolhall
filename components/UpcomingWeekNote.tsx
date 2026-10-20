import Link from "next/link";
import { windowLabel } from "@/lib/format";
import { ChevronIcon } from "./ui";

/**
 * "Week 3 picks are open": shown on Home and My Picks when next week's slate is already
 * published while this week is still running, with how many picks the entry has made there.
 */
export function UpcomingWeekNote({
  href,
  slate,
  picked,
  picksPerSlate,
  timezone,
  className = "",
}: {
  href: string;
  slate: { week: number; label: string | null; window_start: string; window_end: string };
  /** Picks this entry has saved for that week. */
  picked: number;
  picksPerSlate: number;
  timezone: string;
  className?: string;
}) {
  const label = slate.label ?? `Week ${slate.week}`;
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm ring-1 ring-accent/30 transition hover:bg-accent/15 ${className}`}
    >
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-accent">{label} picks are open</span>
        <span className="text-muted"> · {windowLabel(slate.window_start, slate.window_end, timezone)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 font-medium text-accent tabular-nums">
        {picked === 0 ? `Make ${label} picks` : `${picked}/${picksPerSlate} picked`}
        <ChevronIcon className="size-4" />
      </span>
    </Link>
  );
}
