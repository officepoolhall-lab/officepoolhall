"use client";

import { useState, type ReactNode } from "react";
import { FROZEN_HEAD } from "./SeasonStandings";
import { chipClass, SectionLabel } from "./ui";

export type SwitchOption = { id: string; label: string; /** What the button shows, if not the label. */ chip?: ReactNode };

/**
 * One standings column with buttons above it: pick types on Season, weeks on Week standings,
 * segments on Bonus segment. Every view is rendered on the server up front; the buttons only
 * switch which one shows, instantly, and mirror the choice into the address (?param=) with
 * history.replaceState so a refresh or shared link opens on it. The heading, buttons and
 * column labels stay frozen while the rows scroll.
 */
export function OptionSwitcher({
  options,
  initial,
  param,
  defaultId,
  views,
  headers,
  titles,
  lead,
  ariaLabel,
}: {
  options: SwitchOption[];
  initial: string;
  /** The search param that records the choice. */
  param: string;
  /** The choice left out of the address (the page's own default). */
  defaultId: string;
  views: Record<string, ReactNode>;
  /** Each view's column labels. */
  headers: Record<string, ReactNode>;
  /** Each view's heading; omit for no heading (phones, where tabs sit above). */
  titles?: Record<string, ReactNode>;
  /** Anything to freeze above the heading, such as the phone tabs. */
  lead?: ReactNode;
  ariaLabel: string;
}) {
  const [active, setActive] = useState(initial in views ? initial : defaultId in views ? defaultId : (options[0]?.id ?? initial));

  const choose = (id: string) => {
    setActive(id);
    try {
      const url = new URL(window.location.href);
      if (id === defaultId) url.searchParams.delete(param);
      else url.searchParams.set(param, id);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The address is a convenience; the switch itself already happened.
    }
  };

  return (
    <>
      <div className={FROZEN_HEAD}>
        {lead}
        {titles && (
          <SectionLabel className="flex min-h-9 items-center">
            <span>{titles[active]}</span>
          </SectionLabel>
        )}
        <div className="-mx-4 mb-1 flex gap-1 overflow-x-auto px-4 py-1" role="group" aria-label={ariaLabel}>
          {options.map((o) => (
            <button key={o.id} type="button" onClick={() => choose(o.id)} aria-pressed={o.id === active} className={chipClass(o.id === active, "", "xs")}>
              {o.chip ?? o.label}
            </button>
          ))}
        </div>
        {headers[active]}
      </div>
      {views[active]}
    </>
  );
}
