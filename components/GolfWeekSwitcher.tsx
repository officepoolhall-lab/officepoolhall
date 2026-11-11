"use client";

import { useState, type ReactNode } from "react";
import { FROZEN_HEAD } from "./SeasonStandings";
import { inputClass, SectionLabel } from "./ui";

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
        <SectionLabel className="flex min-h-9 items-center">Weekly Standings</SectionLabel>
        <select value={active} onChange={(e) => choose(e.target.value)} aria-label="Choose a week" className={`${inputClass} mb-1 w-full`}>
          {/* Newest first: the week you're most likely after is at the top. */}
          {[...weeks].reverse().map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        {headers[active]}
      </div>
      {views[active]}
    </>
  );
}
