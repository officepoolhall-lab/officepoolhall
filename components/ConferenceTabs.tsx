"use client";

import { useState, type ReactNode } from "react";
import { chipClass } from "./ui";

/** AFC / NFC buttons over one conference at a time, on every screen size (Home's side column is narrow). */
export function ConferenceTabs({ views }: { views: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(views[0]?.id);
  return (
    <>
      <div className="mb-2 flex gap-1" role="group" aria-label="Choose a conference">
        {views.map((v) => (
          <button key={v.id} type="button" onClick={() => setActive(v.id)} aria-pressed={v.id === active} className={chipClass(v.id === active, "", "sm")}>
            {v.label}
          </button>
        ))}
      </div>
      {views.map((v) => (
        <div key={v.id} className={v.id === active ? "" : "hidden"}>
          {v.content}
        </div>
      ))}
    </>
  );
}
