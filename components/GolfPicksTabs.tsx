"use client";

import { useState, type ReactNode } from "react";
import { chipClass } from "./ui";

type Tab = "week" | "log" | "upcoming";

/**
 * My Picks layout. Phones: one panel at a time, chosen from This Week / Season Log / Upcoming
 * Schedule. Desktop: This Week always on the left; the right column switches between Season
 * Log and Upcoming Schedule. The left panel takes its height from the right column (with a
 * floor), so the golfer list fills the same length instead of a short scrolling box.
 */
export function GolfPicksTabs({ thisWeek, log, upcoming }: { thisWeek: ReactNode; log: ReactNode; upcoming: ReactNode }) {
  const [tab, setTab] = useState<Tab>("week");
  // Desktop has no "This Week" tab; there the right column shows the log unless Upcoming is chosen.
  const right: "log" | "upcoming" = tab === "upcoming" ? "upcoming" : "log";
  const button = (key: Tab, label: string, active: boolean, extra = "") => (
    <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={active} className={chipClass(active, extra, "sm")}>
      {label}
    </button>
  );

  return (
    <>
      <div className="mb-4 flex gap-1.5 lg:hidden" role="group" aria-label="Show">
        {button("week", "This Week", tab === "week")}
        {button("log", "Season Log", tab === "log")}
        {button("upcoming", "Upcoming Schedule", tab === "upcoming")}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
        {/* Out of the row's height on desktop (absolute), so the right column sets it. */}
        <div className={`relative lg:block lg:min-h-[44rem] ${tab === "week" ? "" : "hidden"}`}>
          <section aria-label="This week" className="lg:absolute lg:inset-0 lg:flex lg:flex-col">
            {thisWeek}
          </section>
        </div>

        <div className={`lg:block ${tab === "week" ? "hidden" : ""}`}>
          <div className="mb-3 hidden gap-1.5 lg:flex" role="group" aria-label="Show">
            {button("log", "Season Log", right === "log")}
            {button("upcoming", "Upcoming Schedule", right === "upcoming")}
          </div>
          <section aria-label="Season log" className={right === "log" ? "" : "hidden"}>
            {log}
          </section>
          <section aria-label="Upcoming schedule" className={right === "upcoming" ? "" : "hidden"}>
            {upcoming}
          </section>
        </div>
      </div>
    </>
  );
}
