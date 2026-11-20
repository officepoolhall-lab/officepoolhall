"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronIcon, SectionLabel, chipClass } from "./ui";

/**
 * Home's standings: Season and the current week in one table with buttons to switch, instead
 * of two tables stacked (which ran far past the rankings beside them on desktop). Phones show
 * the season only, with no buttons.
 */
export function HomeStandings({ views }: { views: { id: string; label: string; title: string; href: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(views[0].id);
  const view = views.find((v) => v.id === active) ?? views[0];
  return (
    <section>
      {/* Phones: the title the same size as Home's other headers, with All beside it (the Season /
          Week buttons are hidden there). Wider screens: the title a size up on its own line, the
          buttons and All under it. */}
      <div className="flex min-h-11 items-center gap-2 sm:min-h-0">
        <SectionLabel fit className="!text-sm sm:!text-base lg:!text-lg">{view.title}</SectionLabel>
        <Link href={view.href} className="-mr-1 inline-flex h-11 shrink-0 items-center gap-0.5 px-1 text-sm font-medium text-accent sm:hidden">
          All <ChevronIcon className="size-4" />
        </Link>
      </div>
      <div className="hidden min-h-11 items-center justify-between gap-2 whitespace-nowrap sm:flex">
        {views.length > 1 ? (
          <div className="flex gap-1" role="group" aria-label="Season or this week">
            {views.map((v) => (
              <button key={v.id} type="button" onClick={() => setActive(v.id)} aria-pressed={v.id === active} className={chipClass(v.id === active, "", "xs")}>
                {v.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <Link href={view.href} className="-mr-1 ml-auto inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
          All <ChevronIcon className="size-4" />
        </Link>
      </div>
      {view.content}
    </section>
  );
}
