"use client";

import { useState, type ReactNode } from "react";
import { chipClass } from "./ui";

/**
 * Basketball box score columns: the basic counting stats (MIN, PTS, REB, AST, STL, BLK, TO)
 * until "Expand" is tapped, below 1280px; wider screens always show every column. The
 * columns hide by CSS (group-data-[full]), so switching is instant.
 */
export function BoxStatsToggle({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [full, setFull] = useState(false);
  if (!enabled) return <>{children}</>;
  return (
    <div className="group/box" data-full={full}>
      <div className="mb-2 flex justify-end xl:hidden">
        <button type="button" onClick={() => setFull(!full)} aria-pressed={full} className={chipClass(full, "", "xs")}>
          {full ? "Collapse" : "Expand"}
        </button>
      </div>
      {children}
    </div>
  );
}
