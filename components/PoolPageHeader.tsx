import type { ReactNode } from "react";
import { LiveTicker } from "@/components/LiveTicker";
import { PageTitle } from "@/components/ui";
import type { SlateGame } from "@/lib/pool";

/**
 * The top of a pool page, the same in every pool type: the page's title on the left (My Picks'
 * week, "Standings"...) and the games' live scores filling the space to its right (below it on
 * phones). New pool types use this, so their pages start out looking like the others'.
 */
export function PoolPageHeader({
  title,
  sub,
  games = [],
  now,
  timezone,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  games?: SlateGame[];
  now: number;
  timezone: string;
  /** Anything that belongs under the title row (week chips, notes). */
  children?: ReactNode;
}) {
  return (
    <div className="shrink-0">
      <div className="sm:flex sm:items-start sm:gap-6">
        <div className="shrink-0">
          <PageTitle sub={sub}>{title}</PageTitle>
        </div>
        {games.length > 0 && <LiveTicker games={games} now={now} timezone={timezone} className="-mt-2 mb-4 sm:mt-1.5 sm:mb-0 sm:flex-1" />}
      </div>
      {children}
    </div>
  );
}
