"use client";

import { useRef, useState, useTransition } from "react";

/** The Roster's Notes cell: type a note, it saves when you leave the field (or press Enter). */
export function RosterNote({
  initial,
  save,
  label,
}: {
  initial: string;
  save: (note: string) => Promise<{ ok: boolean; message?: string }>;
  label: string;
}) {
  const saved = useRef(initial);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();
  const commit = (value: string) => {
    if (value.trim() === saved.current.trim()) return;
    start(async () => {
      const r = await save(value).catch(() => ({ ok: false }));
      if (r.ok) {
        saved.current = value;
        setState("saved");
        setTimeout(() => setState("idle"), 1500);
      } else setState("error");
    });
  };
  return (
    <div className="relative">
      <input
        defaultValue={initial}
        maxLength={300}
        aria-label={label}
        placeholder="Add a note"
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`h-10 w-full rounded-[10px] bg-bg px-3 pr-14 text-sm outline-none ring-1 placeholder:text-faint focus:ring-2 focus:ring-accent ${state === "error" ? "ring-loss" : "ring-line"}`}
      />
      <span aria-live="polite" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
        {pending ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Not saved" : ""}
      </span>
    </div>
  );
}
