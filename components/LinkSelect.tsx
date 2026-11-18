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
      className={`h-7 min-w-0 max-w-full truncate rounded-lg border border-line bg-bg pl-2 pr-7 text-xs font-medium text-ink ${pending ? "opacity-60" : ""}`}
    >
      {options.map((o) => (
        <option key={o.href} value={o.href}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
