"use client";

import { useState, type ReactNode } from "react";
import { FROZEN_HEAD } from "./SeasonStandings";
import { SectionLabel } from "./ui";

/**
 * The golf Weekly Standings column with a dropdown of weeks (a season has up to ~37, too many
 * for a row of buttons). Every week is rendered on the server; the dropdown only switches which
 * shows, and mirrors the choice into ?week= so a refresh or shared link opens on it.
 */
export function GolfWeekSwitcher({
  weeks,
  initial,
  defaultId,
  views,
  headers,
  lead,
}: {
  weeks: { id: string; label: string }[];
  initial: string;
  /** The week left out of the address (the page's own default). */
  defaultId: string;
  views: Record<string, ReactNode>;
  headers: Record<string, ReactNode>;
  /** Anything to freeze above the heading, such as the phone tabs. */
  lead?: ReactNode;
}) {
  const [active, setActive] = useState(initial in views ? initial : defaultId);

  const choose = (id: string) => {
    setActive(id);
    try {
      const url = new URL(window.location.href);
      if (id === defaultId) url.searchParams.delete("week");
      else url.searchParams.set("week", id);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The address is a convenience; the switch itself already happened.
    }
  };

  return (
    <>
      <div className={FROZEN_HEAD}>
        {lead}
        {/* Title and dropdown on one line, so this column's rows start level with Season's. */}
        <div className="flex min-h-9 items-center gap-3">
          <SectionLabel className="shrink-0">Weekly Standings</SectionLabel>
          <select
            value={active}
            onChange={(e) => choose(e.target.value)}
            aria-label="Choose a week"
            className="h-8 min-w-0 flex-1 truncate rounded-lg border border-line bg-bg px-2 text-sm text-ink"
          >
            {/* Newest first: the week you're most likely after is at the top. */}
            {[...weeks].reverse().map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        {headers[active]}
      </div>
      {views[active]}
    </>
  );
}
