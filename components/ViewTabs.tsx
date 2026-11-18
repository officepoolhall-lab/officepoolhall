"use client";

import { useState, type ReactNode } from "react";
import { chipClass } from "./ui";

/**
 * A few views of one page behind small buttons (Pick History: By Week | By Team). Every view
 * is rendered on the server up front; the buttons only switch which one shows, instantly,
 * and mirror the choice into the address (?param=) so a refresh or shared link keeps it.
 * Desktop (lg+) has room for all of them: they sit side by side under their own headings
 * and the buttons go away.
 */
export function ViewTabs({
  views,
  initial,
  param,
  ariaLabel,
}: {
  /** In button order; the first is the default (left out of the address). `scroll`: on desktop
      this view doesn't set the row's height; it ends where its neighbors end (at least 24rem)
      and scrolls inside, e.g. a long play-by-play beside the box score. */
  views: { id: string; label: string; content: ReactNode; scroll?: boolean }[];
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
      <div className="mb-3 flex gap-1 lg:hidden" role="group" aria-label={ariaLabel}>
        {views.map((v) => (
          <button key={v.id} type="button" onClick={() => choose(v.id)} aria-pressed={v.id === active} className={chipClass(v.id === active, "", "sm")}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="lg:grid lg:grid-flow-col lg:auto-cols-fr lg:items-start lg:gap-10">
        {views.map((v) => (
          <section
            key={v.id}
            aria-label={v.label}
            className={`${v.id === active ? "" : "hidden lg:block"} ${v.scroll ? "lg:!flex lg:h-0 lg:min-h-[max(100%,24rem)] lg:flex-col" : ""}`}
          >
            <h2 className="mb-2 hidden shrink-0 text-lg font-extrabold tracking-[-0.03em] lg:block">{v.label}</h2>
            {v.scroll ? <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">{v.content}</div> : v.content}
          </section>
        ))}
      </div>
    </>
  );
}
