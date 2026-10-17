"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={buttonClass("primary")}
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
