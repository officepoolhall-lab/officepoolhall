import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { PoolSettings } from "./poolSettings";

type WindowSettings = Pick<PoolSettings, "timezone" | "window" | "lock">;

/** Local calendar date (yyyy-MM-dd) of an instant in the pool's time zone. */
export function localDate(at: Date, timezone: string) {
  return formatInTimeZone(at, timezone, "yyyy-MM-dd");
}

function weekdayOf(isoDate: string) {
  return parseISO(isoDate).getDay();
}

function plusDays(isoDate: string, days: number) {
  return format(addDays(parseISO(isoDate), days), "yyyy-MM-dd");
}

/**
 * The first window start on or after `after`, as a local date. If a window
 * started earlier today, that one is already underway, so the next one is returned.
 */
export function nextWindowStartDate(after: Date, s: WindowSettings) {
  let d = localDate(after, s.timezone);
  const startedToday =
    weekdayOf(d) === s.window.start_weekday && fromZonedTime(`${d}T00:00:00`, s.timezone) < after;
  if (startedToday) d = plusDays(d, 1);
  while (weekdayOf(d) !== s.window.start_weekday) d = plusDays(d, 1);
  return d;
}

/**
 * A slate's window: local midnight on `startDate` through local midnight
 * `length_days` later (exclusive), so Mon → Sun 23:59:59 by default. DST-safe:
 * each boundary is converted from the pool's wall clock separately.
 * In weekly lock mode, lock_at is the first lock weekday/time inside the window.
 */
export function slateWindow(startDate: string, s: WindowSettings) {
  const window_start = fromZonedTime(`${startDate}T00:00:00`, s.timezone);
  const window_end = fromZonedTime(`${plusDays(startDate, s.window.length_days)}T00:00:00`, s.timezone);

  let lock_at: Date | null = null;
  if (s.lock.mode === "weekly" && s.lock.weekly) {
    let d = startDate;
    while (weekdayOf(d) !== s.lock.weekly.weekday) d = plusDays(d, 1);
    lock_at = fromZonedTime(`${d}T${s.lock.weekly.time}:00`, s.timezone);
  }

  return { window_start, window_end, lock_at };
}
