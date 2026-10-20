"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Phones show one Standings column at a time behind Season / Weekly / Bonus Segments /
 * Tournaments tabs; desktop shows them all side by side. The columns are rendered once and the tabs only toggle which one
 * is visible, so switching is instant.
 */
type Tab = "season" | "segment" | "weekly" | "tournaments" | "bracket";
const TabContext = createContext<{ tab: Tab; setTab: (t: Tab) => void; hasSegments: boolean; hasTournaments: boolean; hasBracket: boolean } | null>(null);

export function StandingsTabs({
  initial,
  hasSegments,
  hasTournaments = false,
  hasBracket = false,
  children,
}: {
  initial: Tab;
  hasSegments: boolean;
  hasTournaments?: boolean;
  hasBracket?: boolean;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(initial);
  return <TabContext.Provider value={{ tab, setTab, hasSegments, hasTournaments, hasBracket }}>{children}</TabContext.Provider>;
}

/** A column: always shown on desktop, only when its tab is active on phones. */
export function TabPanel({ id, label, children }: { id: Tab; label: string; children: ReactNode }) {
  const ctx = useContext(TabContext);
  return (
    <section aria-label={label} className={`${ctx?.tab === id ? "" : "hidden"} lg:block`}>
      {children}
    </section>
  );
}

/** The phone tab row, frozen at the top of whichever column is showing. */
export function MobileTabs() {
  const ctx = useContext(TabContext);
  if (!ctx) return null;
  // Season, Weekly, then Bonus Segments and Tournaments when the pool has them.
  const tabs: [Tab, string][] = [
    ["season", "Season"],
    ["weekly", "Weekly"],
    ...(ctx.hasSegments ? [["segment", "Bonus Segments"] as [Tab, string]] : []),
    ...(ctx.hasTournaments ? [["tournaments", "Tournaments"] as [Tab, string]] : []),
    ...(ctx.hasBracket ? [["bracket", "Bracket"] as [Tab, string]] : []),
  ];
  return (
    <div className="mb-3 mt-1 inline-flex rounded-full bg-surface p-0.5 lg:hidden" role="tablist">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={ctx.tab === id}
          onClick={() => ctx.setTab(id)}
          className={`flex h-8 items-center justify-center rounded-full px-3.5 text-xs font-medium transition ${
            ctx.tab === id ? "bg-ink text-bg" : "text-muted hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
