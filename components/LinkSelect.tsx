"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** A dropdown whose choices are pages (the Grid's weeks): choosing one goes there. */
export function LinkSelect({ options, value, ariaLabel, size = "sm" }: { options: { href: string; label: string }[]; value: string; ariaLabel: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      aria-busy={pending}
      onChange={(e) => {
        const href = e.target.value;
        start(() => router.push(href));
      }}
      className={`min-w-0 max-w-full truncate rounded-full border-0 bg-surface py-0 font-medium text-ink hover:bg-hover ${size === "md" ? "h-9 pl-3.5 pr-9 text-sm" : "h-6 pl-2.5 pr-7 text-[11px]"} ${pending ? "opacity-60" : ""}`}
    >
      {options.map((o) => (
        <option key={o.href} value={o.href}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
