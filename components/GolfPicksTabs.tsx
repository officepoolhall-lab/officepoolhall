"use client";

import { useState, type ReactNode } from "react";
import { chipClass } from "./ui";

type Tab = "week" | "log" | "upcoming";

/**
 * My Picks layout, sized to the screen (the page itself doesn't scroll on most screens; each
 * panel scrolls inside). Phones: one panel at a time, chosen from This Week / Season Log /
 * Upcoming Schedule. Desktop: This Week (the field) on the left, the Season Log or Upcoming
 * Schedule on the right, both running to the bottom of the screen.
 */
export function GolfPicksTabs({ title, thisWeek, log, upcoming }: { title: ReactNode; thisWeek: ReactNode; log: ReactNode; upcoming: ReactNode }) {
  const [tab, setTab] = useState<Tab>("week");
  // Desktop has no "This Week" tab; there the right column shows the log unless Upcoming is chosen.
  const right: "log" | "upcoming" = tab === "upcoming" ? "upcoming" : "log";
  const button = (key: Tab, label: string, active: boolean) => (
    <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={active} className={chipClass(active, "", "sm")}>
      {label}
    </button>
  );

  return (
    <>
      {/* The title and (phones) the panel buttons share a row. */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {title}
        <div className="flex flex-wrap gap-1.5 lg:hidden" role="group" aria-label="Show">
          {button("week", "This Week", tab === "week")}
          {button("log", "Season Log", tab === "log")}
          {button("upcoming", "Upcoming", tab === "upcoming")}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-8 lg:mx-auto lg:w-full lg:max-w-7xl lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] 2xl:max-w-[112rem] 2xl:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
        <section aria-label="This week" className={`min-h-0 flex-col lg:flex ${tab === "week" ? "flex" : "hidden"}`}>
          {thisWeek}
        </section>

        {/* Large screens: the Season Log and Upcoming Schedule side by side, no switching. */}
        <div className={`min-h-0 min-w-0 flex-col lg:flex 2xl:grid 2xl:grid-cols-2 2xl:grid-rows-[minmax(0,1fr)] 2xl:gap-8 ${tab === "week" ? "hidden" : "flex"}`}>
          <div className="mb-3 hidden shrink-0 gap-1.5 lg:flex 2xl:hidden" role="group" aria-label="Show">
            {button("log", "Season Log", right === "log")}
            {button("upcoming", "Upcoming Schedule", right === "upcoming")}
          </div>
          <section aria-label="Season log" className={`min-h-0 flex-1 flex-col 2xl:flex ${right === "log" ? "flex" : "hidden"}`}>
            <h2 className="mb-2 hidden shrink-0 text-xs font-semibold uppercase tracking-wide text-muted 2xl:block">Season Log</h2>
            {log}
          </section>
          <section aria-label="Upcoming schedule" className={`min-h-0 flex-1 flex-col 2xl:flex ${right === "upcoming" ? "flex" : "hidden"}`}>
            <h2 className="mb-2 hidden shrink-0 text-xs font-semibold uppercase tracking-wide text-muted 2xl:block">Upcoming Schedule</h2>
            {upcoming}
          </section>
        </div>
      </div>
    </>
  );
}
