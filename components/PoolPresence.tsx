"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Who's on the site right now, per pool, through Supabase Realtime Presence (no database
 * writes). Every pool page reports the viewer while its tab is open and visible; anything that
 * wants to know who else is here (the Roster's green dots) reads the set from context. Leaving,
 * closing the tab or hiding it for a minute drops them off within seconds.
 */
const OnlineContext = createContext<Set<string>>(new Set());

/** How long a hidden tab still counts as "on the site" (switching apps for a moment). */
const HIDDEN_GRACE_MS = 60_000;

export function PoolPresence({ poolId, userId, children }: { poolId: string; userId: string; children: ReactNode }) {
  const [online, setOnline] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const supabase = createClient();
    // Only user ids are shared on the channel; names stay on the server.
    const channel = supabase.channel(`pool-presence:${poolId}`, { config: { presence: { key: userId } } });
    let tracking = false;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;

    const track = () => {
      if (tracking) return;
      tracking = true;
      void channel.track({ at: new Date().toISOString() });
    };
    const untrack = () => {
      if (!tracking) return;
      tracking = false;
      void channel.untrack();
    };

    channel
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && document.visibilityState === "visible") track();
      });

    const onVisibility = () => {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      if (document.visibilityState === "visible") track();
      else hiddenTimer = setTimeout(untrack, HIDDEN_GRACE_MS);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
      void supabase.removeChannel(channel);
    };
  }, [poolId, userId]);

  return <OnlineContext.Provider value={online}>{children}</OnlineContext.Provider>;
}

/** A small green dot when this person is on the site right now; nothing otherwise. */
export function OnlineDot({ userId, className = "" }: { userId: string; className?: string }) {
  const online = useContext(OnlineContext).has(userId);
  if (!online) return null;
  return (
    <span title="On the site now" className={`inline-block size-2 shrink-0 rounded-full bg-win ${className}`}>
      <span className="sr-only">, on the site now</span>
    </span>
  );
}
