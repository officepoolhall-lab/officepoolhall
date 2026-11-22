"use client";

import type { ReactNode } from "react";

/**
 * An entry's name on the League Grid: tapping it scrolls the grid sideways to the week that
 * entry went out (or this week, if they're still alive) and flashes that cell.
 */
export function SvNameJump({ target, label, children }: { target: string; label: string; children: ReactNode }) {
  const jump = () => {
    const cell = document.getElementById(target);
    if (!cell) return;
    cell.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    cell.classList.add("sv-flash");
    window.setTimeout(() => cell.classList.remove("sv-flash"), 1600);
  };
  return (
    <button
      type="button"
      onClick={jump}
      title={label}
      className="-mx-1.5 -my-0.5 block w-[calc(100%+0.75rem)] rounded-md px-1.5 py-0.5 text-left transition hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}
