"use client";

import { useState } from "react";
import { SportIcon } from "@/components/SportIcon";
import { LEAGUES } from "@/lib/poolCatalog";

// The landing page's pool types: pick a sport or league first, then see the pools it offers.

export function PoolTypes() {
  const [active, setActive] = useState(LEAGUES[0].id);
  const league = LEAGUES.find((l) => l.id === active) ?? LEAGUES[0];

  return (
    <div>
      {/* Step 1: the sport or league. */}
      <div role="tablist" aria-label="Sport" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {LEAGUES.map((l) => {
          const on = l.id === active;
          return (
            <button
              key={l.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(l.id)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition ${
                on ? "bg-accent text-white ring-1 ring-accent dark:text-black" : "bg-bg text-ink ring-1 ring-line hover:bg-hover"
              }`}
            >
              <SportIcon kind={l.kind} className={`size-6 shrink-0 ${on ? "" : "text-accent"}`} />
              <span className="min-w-0">
                <span className="block text-lg font-extrabold leading-tight tracking-[-0.02em]">{l.label}</span>
                <span className={`block truncate text-xs ${on ? "opacity-85" : "text-muted"}`}>
                  {l.types.length} {l.types.length === 1 ? "pool type" : "pool types"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Step 2: that league's pools. */}
      <div role="tabpanel" aria-label={`${league.full} pools`} className="mt-6">
        <div className="mb-3 text-sm font-semibold text-muted">{league.full} pools</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Not links yet: pool setup is being reworked, so these only describe each pool. */}
          {league.types.map((t) => (
            <div key={t.id} className="flex flex-col rounded-2xl bg-bg p-5 ring-1 ring-line">
              {/* The label sits above the name so long names stay on one line. */}
              {!t.live && <span className="mb-2 self-start rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">Coming soon</span>}
              <h3 className="whitespace-nowrap text-lg font-bold leading-tight">{t.name}</h3>
              <p className="mt-2 flex-1 text-sm text-muted">{t.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
