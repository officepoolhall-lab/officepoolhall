"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

export function CopyButton({ text, label = "Copy", subtle = false }: { text: string; label?: string; /** Secondary, small: for a section header. */ subtle?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={subtle ? buttonClass("secondary", "!h-8 !px-3 !text-xs") : buttonClass("primary")}
      onClick={async () => {
        // writeText rejects outside HTTPS or without clipboard permission.
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed" : label}</span>
    </button>
  );
}
