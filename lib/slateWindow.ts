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
 * A slate's window: local midnight on `startDate` through local midnight after the
 * last day (exclusive), so Mon → Sun 23:59:59 by default. `endDate` (inclusive local
 * date) overrides `length_days` for an odd week — Week 1 runs Sun Nov 1 – Sun Nov 8.
 * DST-safe: each boundary is converted from the pool's wall clock separately.
 *
 * In weekly lock mode:
 * - lock_at is the main deadline, the first lock weekday on/after startDate at lock.weekly.time.
 * - first_day_lock_at, when lock.weekly.first_day_time is set, is the earlier deadline for the
 *   window's "first day": the first date in the window that falls on window.start_weekday
 *   (Monday for Pool A — so a window starting Sunday still gets its Monday deadline). The
 *   database pulls it earlier still to that day's first tip when publishing.
 */
export function slateWindow(startDate: string, s: WindowSettings, endDate?: string) {
  const lastDay = endDate ?? plusDays(startDate, s.window.length_days - 1);
  if (lastDay < startDate) throw new Error("The last day can't be before the first day");
  const window_start = fromZonedTime(`${startDate}T00:00:00`, s.timezone);
  const window_end = fromZonedTime(`${plusDays(lastDay, 1)}T00:00:00`, s.timezone);

  let lock_at: Date | null = null;
  let first_day_lock_at: Date | null = null;
  if (s.lock.mode === "weekly" && s.lock.weekly) {
    let d = startDate;
    while (weekdayOf(d) !== s.lock.weekly.weekday) d = plusDays(d, 1);
    lock_at = fromZonedTime(`${d}T${s.lock.weekly.time}:00`, s.timezone);

    if (s.lock.weekly.first_day_time) {
      let f = startDate;
      while (weekdayOf(f) !== s.window.start_weekday && f < lastDay) f = plusDays(f, 1);
      // A short window that never reaches the first weekday has no first-day group.
      if (weekdayOf(f) === s.window.start_weekday) {
        first_day_lock_at = fromZonedTime(`${f}T${s.lock.weekly.first_day_time}:00`, s.timezone);
      }
    }
  }

  return { window_start, window_end, lock_at, first_day_lock_at };
}
