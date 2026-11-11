"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** A dropdown of the season's tournaments; choosing one loads its leaderboard (?event=). */
export function GolfEventSelect({ events, value, basePath }: { events: { id: string; label: string }[]; value: string; basePath: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      value={value}
      aria-label="Choose a tournament"
      aria-busy={pending}
      onChange={(e) => {
        const id = e.target.value;
        start(() => router.push(`${basePath}?event=${encodeURIComponent(id)}`));
      }}
      className={`h-9 min-w-0 max-w-full truncate rounded-lg border border-line bg-bg px-2 text-sm text-ink ${pending ? "opacity-60" : ""}`}
    >
      {events.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </select>
  );
}
