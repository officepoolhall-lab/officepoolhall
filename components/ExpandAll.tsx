"use client";

import { useState } from "react";
import { chipClass } from "./ui";

/** A button that opens or closes every <details> inside the element with this id. */
export function ExpandAll({ target, open: openLabel = "Expand all", close: closeLabel = "Collapse all" }: { target: string; open?: string; close?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !open;
        document.getElementById(target)?.querySelectorAll("details").forEach((d) => (d.open = next));
        setOpen(next);
      }}
      className={chipClass(false, "cursor-pointer", "sm")}
    >
      {open ? closeLabel : openLabel}
    </button>
  );
}
