"use client";

import { useState, type ReactNode } from "react";
import { chipClass } from "./ui";

/**
 * Small tabs that show one section at a time on every screen size (Box Score: Team Stats ·
 * home · away). The sections are rendered on the server; the buttons only switch which shows.
 */
export function SubTabs({
  tabs,
  ariaLabel,
}: {
  /** `short`: the label on phones when the full one is too long for a third of the width. */
  tabs: { id: string; label: string; short?: string; content: ReactNode }[];
  ariaLabel: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  if (!tabs.length) return null;
  return (
    <>
      {/* One row always: on phones the tabs share the width equally, each label on one line. */}
      <div className="mb-3 flex gap-1" role="group" aria-label={ariaLabel}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            aria-pressed={t.id === active}
            title={t.label}
            className={`${chipClass(t.id === active, "", "xs")} min-w-0 flex-1 !shrink basis-0 justify-center !text-xs sm:flex-none sm:!shrink-0 sm:basis-auto`}
          >
            <span className="truncate whitespace-nowrap sm:hidden">{t.short ?? t.label}</span>
            <span className="hidden whitespace-nowrap sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={t.id === active ? "" : "hidden"}>
          {t.content}
        </div>
      ))}
    </>
  );
}
