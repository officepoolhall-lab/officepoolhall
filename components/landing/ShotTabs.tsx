"use client";

import { useState, type ReactNode } from "react";

/** The look-inside tabs: one page at a time (all are rendered; the others are hidden). */
export function ShotTabs({ tabs }: { tabs: { id: string; label: string; node: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div role="tablist" aria-label="Pages" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.id)}
              className={`h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition ${
                on ? "bg-accent text-white dark:text-black" : "bg-bg text-ink ring-1 ring-line hover:bg-hover"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={t.id !== active}>
          {t.node}
        </div>
      ))}
    </div>
  );
}
