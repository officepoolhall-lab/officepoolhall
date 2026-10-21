"use client";

import { useState, type ReactNode } from "react";
import { chipClass } from "./ui";

/**
 * Small tabs that show one section at a time on every screen size (Box Score: Team Stats ·
 * home · away). The sections are rendered on the server; the buttons only switch which shows.
 */
export function SubTabs({ tabs, ariaLabel }: { tabs: { id: string; label: string; content: ReactNode }[]; ariaLabel: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  if (!tabs.length) return null;
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label={ariaLabel}>
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setActive(t.id)} aria-pressed={t.id === active} className={chipClass(t.id === active, "", "xs")}>
            {t.label}
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
