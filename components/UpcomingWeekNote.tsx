import { FitText } from "./FitText";
import Link from "next/link";
import { ChevronIcon } from "./ui";

/**
 * "Week 3 Picks Are Open": shown on Home and My Picks when next week's slate is already
 * published while this week is still running, with how many picks the entry has made there.
 */
export function UpcomingWeekNote({
  href,
  slate,
  picked,
  picksPerSlate,
  timezone,
  className = "",
  simple = false,
}: {
  href: string;
  slate: { week: number; label: string | null; window_start: string; window_end: string };
  /** Picks this entry has saved for that week. */
  picked: number;
  picksPerSlate: number;
  timezone: string;
  className?: string;
  /** Home: just "Make Week 3 Picks" (no dates or count). */
  simple?: boolean;
}) {
  const label = slate.label ?? `Week ${slate.week}`;
  if (simple)
    return (
      <Link
        href={href}
        className={`flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-[15px] font-semibold bg-accent text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:brightness-95 ${className}`}
      >
        Make {label} Picks <span aria-hidden>→</span>
      </Link>
    );
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-accent text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:brightness-95 ${className}`}
    >
      {/* One line: the text steps down to fit a narrow column. */}
      <FitText min={10} className="flex-1">
        <span className="font-semibold">{label} Picks Are Open</span>
      </FitText>
      <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap font-semibold tabular-nums">
        {picked === 0 ? `Make ${label} Picks` : `${picked}/${picksPerSlate} Picked`}
        <ChevronIcon className="size-4" />
      </span>
    </Link>
  );
}
