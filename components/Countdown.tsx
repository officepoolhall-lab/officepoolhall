"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";

/** Live "2h 14m" until `to`. Ticks every second under an hour, every 30s otherwise. */
export function Countdown({ to, done = "now" }: { to: string; done?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = new Date(to).getTime() - now;

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setNow(Date.now()), remaining < 3_600_000 ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [remaining]);

  return <span className="tabular-nums">{remaining > 0 ? formatDuration(remaining) : done}</span>;
}
