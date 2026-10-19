"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const COOKIE = "oph_tz"; // lib/viewerTime.ts

/**
 * Tells the server this device's time zone so game times can show in it. Runs once per page
 * load; when the zone is new (first visit, or the device moved zones) it saves it and refreshes
 * the page's data so the times update right away.
 */
export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return;
    }
    if (!tz) return;
    const current = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`))?.[1];
    if (current && decodeURIComponent(current) === tz) return;
    document.cookie = `${COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=${400 * 24 * 60 * 60}; samesite=lax`;
    router.refresh();
  }, [router]);
  return null;
}
