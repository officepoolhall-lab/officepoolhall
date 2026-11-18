"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** A dropdown whose choices are pages (the Grid's weeks): choosing one goes there. */
export function LinkSelect({ options, value, ariaLabel }: { options: { href: string; label: string }[]; value: string; ariaLabel: string }) {
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
      className={`h-6 min-w-0 max-w-full truncate rounded-full border-0 bg-surface py-0 pl-2.5 pr-7 text-[11px] font-medium text-ink hover:bg-hover ${pending ? "opacity-60" : ""}`}
    >
      {options.map((o) => (
        <option key={o.href} value={o.href}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
