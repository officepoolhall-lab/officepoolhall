"use client";

import { useState, type ReactNode } from "react";
import { FROZEN_HEAD } from "./SeasonStandings";
import { chipClass, SectionLabel } from "./ui";

/**
 * The Season table's pick-type filter. Every view (All, Favorites, Underdogs, Home, Away) is
 * rendered on the server; the buttons just switch which one shows, instantly and without a
 * reload. The choice is mirrored into the address (?split=) so a refresh or shared link keeps it.
 */
export function SplitSwitcher({
  options,
  initial,
  views,
  headers,
  title,
  lead,
}: {
  options: { id: string; label: string }[];
  initial: string;
  views: Record<string, ReactNode>;
  /** Each view's column labels; frozen with the heading and buttons while the rows scroll. */
  headers: Record<string, ReactNode>;
  /** Column heading ("Season"); the active filter is added to it. Omit for no heading. */
  title?: string;
  /** Anything to freeze above the heading, such as the phone tabs. */
  lead?: ReactNode;
}) {
  const [active, setActive] = useState(views[initial] ? initial : options[0].id);
  const label = options.find((o) => o.id === active)?.label;

  const choose = (id: string) => {
    setActive(id);
    try {
      const url = new URL(window.location.href);
      if (id === options[0].id) url.searchParams.delete("split");
      else url.searchParams.set("split", id);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The address is a convenience; the switch itself already happened.
    }
  };

  return (
    <>
      <div className={FROZEN_HEAD}>
      {lead}
      {title && (
        <SectionLabel className="flex min-h-9 items-center">
          <span>
            {title}
            {active !== options[0].id && <span className="font-normal normal-case tracking-normal">&nbsp;· {label} picks</span>}
          </span>
        </SectionLabel>
      )}
      <div className="-mx-4 mb-1 flex gap-1 overflow-x-auto px-4 py-1" role="group" aria-label="Filter season records by pick type">
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => choose(o.id)} aria-pressed={o.id === active} className={chipClass(o.id === active, "", "xs")}>
            {o.label}
          </button>
        ))}
      </div>
      {headers[active]}
      </div>
      {views[active]}
    </>
  );
}
