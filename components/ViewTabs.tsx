"use client";

import { useState, type ReactNode } from "react";
import { chipClass } from "./ui";

/**
 * A few views of one page behind small buttons (Pick History: By Week | By Team). Every view
 * is rendered on the server up front; the buttons only switch which one shows, instantly,
 * and mirror the choice into the address (?param=) so a refresh or shared link keeps it.
 */
export function ViewTabs({
  views,
  initial,
  param,
  ariaLabel,
}: {
  /** In button order; the first is the default (left out of the address). */
  views: { id: string; label: string; content: ReactNode }[];
  initial?: string;
  param: string;
  ariaLabel: string;
}) {
  const [active, setActive] = useState(views.some((v) => v.id === initial) ? initial! : views[0].id);

  const choose = (id: string) => {
    setActive(id);
    try {
      const url = new URL(window.location.href);
      if (id === views[0].id) url.searchParams.delete(param);
      else url.searchParams.set(param, id);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The address is a convenience; the switch itself already happened.
    }
  };

  return (
    <>
      <div className="mb-3 flex gap-1" role="group" aria-label={ariaLabel}>
        {views.map((v) => (
          <button key={v.id} type="button" onClick={() => choose(v.id)} aria-pressed={v.id === active} className={chipClass(v.id === active, "", "sm")}>
            {v.label}
          </button>
        ))}
      </div>
      {views.find((v) => v.id === active)!.content}
    </>
  );
}
