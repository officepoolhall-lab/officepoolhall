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
      <div className="flex items-center justify-between gap-2">
        <SectionLabel className="!text-sm">{view.title}</SectionLabel>
        <div className="flex items-center gap-1">
          {views.length > 1 && (
            <div className="hidden gap-1 sm:flex" role="group" aria-label="Season or this week">
              {views.map((v) => (
                <button key={v.id} type="button" onClick={() => setActive(v.id)} aria-pressed={v.id === active} className={chipClass(v.id === active, "", "xs")}>
                  {v.label}
                </button>
              ))}
            </div>
          )}
          <Link href={view.href} className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
            All <ChevronIcon className="size-4" />
          </Link>
        </div>
      </div>
      {view.content}
    </section>
  );
}
