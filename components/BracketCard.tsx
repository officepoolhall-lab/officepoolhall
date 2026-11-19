import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronIcon, LockIcon } from "./ui";

/**
 * The NCAA Tournament bracket's entry point on Home and My Picks: picks made (or points once
 * games are in) and when it locks, linking to the bracket page.
 */
export function BracketCard({
  href,
  name,
  lockAt,
  picked,
  points,
  locked,
  timezone,
  className = "",
}: {
  href: string;
  name: string;
  lockAt: string;
  picked: number;
  /** Points so far, once any result is in. */
  points: number | null;
  locked: boolean;
  timezone: string;
  className?: string;
}) {
  const complete = picked >= 63;
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm bg-accent text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:brightness-95 ${className}`}
    >
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{name} Bracket</span>
        <span className="text-white/80">
          {" · "}
          {locked ? (
            <span className="inline-flex items-center gap-1"><LockIcon className="size-3" /> Locked</span>
          ) : (
            <>Locks {formatInTimeZone(lockAt, timezone, "EEE M/d, h:mm a")}</>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 font-semibold tabular-nums">
        {points !== null ? `${points} Pts` : picked === 0 ? (locked ? "View Brackets" : "Fill Out Bracket") : complete ? "63/63 Picked" : `${picked}/63 Picked`}
        <ChevronIcon className="size-4" />
      </span>
    </Link>
  );
}
