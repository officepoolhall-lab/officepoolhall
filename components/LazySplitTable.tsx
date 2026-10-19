"use client";

import { useEffect, useState } from "react";
import { loadPickSplits } from "@/app/p/[slug]/standings/actions";
import type { StandingRow } from "@/lib/standings";
import { SeasonStandings } from "./SeasonStandings";

type Splits = Record<"fav" | "dog" | "home" | "away", StandingRow[]>;
// One fetch per pool per visit: the first filter tap loads all four breakdowns.
const cache = new Map<string, Promise<Splits | null>>();

function load(slug: string): Promise<Splits | null> {
  const hit = cache.get(slug);
  if (hit) return hit;
  const p: Promise<Splits | null> = loadPickSplits(slug)
    .then((r) => (r.ok ? (r.splits as Splits) : null))
    .catch(() => null);
  // A failed load is forgotten so a later tap can retry.
  void p.then((v) => {
    if (!v) cache.delete(slug);
  });
  cache.set(slug, p);
  return p;
}

/** The Season table for one pick type, loaded on first use. */
export function LazySplitTable({ slug, split, me, flat }: { slug: string; split: keyof Splits; me: string; flat: boolean }) {
  const [state, setState] = useState<{ rows: StandingRow[] } | "loading" | "failed">("loading");
  useEffect(() => {
    let live = true;
    load(slug).then((s) => live && setState(s ? { rows: s[split] } : "failed"));
    return () => {
      live = false;
    };
  }, [slug, split]);

  if (state === "loading") return <p className="border-b border-line py-3 text-sm text-muted">Loading…</p>;
  if (state === "failed") return <p className="border-b border-line py-3 text-sm text-muted">This breakdown couldn&apos;t load right now. Try again in a minute.</p>;
  return (
    <SeasonStandings rows={state.rows} me={me} flat={flat} week={null} bonus={null} playerHref={(id) => `/p/${slug}/standings/${id}`} compact header={false} />
  );
}
