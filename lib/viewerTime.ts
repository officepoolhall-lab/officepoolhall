import "server-only";
import { cookies } from "next/headers";

// Game times show in each viewer's own time zone. The browser reports it (TimeZoneSync sets
// this cookie from the device's clock setting); until it has, and for anything invalid, the
// pool's time zone is used. Deadlines don't change: a game locks at the same moment for
// everyone, it's only displayed differently. Admin pages and week date ranges stay in the
// pool's zone, since those are the pool's own calendar.
export const VIEWER_TZ_COOKIE = "oph_tz";

function valid(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The viewer's time zone (from their device), or `fallback` until it's known. */
export async function getViewerTimeZone(fallback: string) {
  const raw = (await cookies()).get(VIEWER_TZ_COOKIE)?.value;
  const tz = raw ? decodeURIComponent(raw) : "";
  return tz && valid(tz) ? tz : fallback;
}
