import { formatInTimeZone } from "date-fns-tz";

const MINUS = "−";

/** −3.5 / +3.5 / PK. `null` → em dash. */
export function formatSpread(spread: number | null | undefined) {
  if (spread === null || spread === undefined) return "—";
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${MINUS}${Math.abs(spread)}`;
}

/** "Tue 7:00 PM" in the pool's time zone. */
export function gameTime(at: string | Date, timezone: string) {
  return formatInTimeZone(at, timezone, "EEE h:mm a");
}

export function timeOnly(at: string | Date, timezone: string) {
  return formatInTimeZone(at, timezone, "h:mm a");
}

/** "Sat · Nov 7" */
export function dayLabel(at: string | Date, timezone: string) {
  return formatInTimeZone(at, timezone, "EEE · MMM d");
}

export function dayKey(at: string | Date, timezone: string) {
  return formatInTimeZone(at, timezone, "yyyy-MM-dd");
}

/** "Mon Nov 2 – Sun Nov 8" for an exclusive-end window. */
export function windowLabel(start: string, end: string, timezone: string) {
  const last = new Date(new Date(end).getTime() - 60_000);
  return `${formatInTimeZone(start, timezone, "EEE MMM d")} – ${formatInTimeZone(last, timezone, "EEE MMM d")}`;
}

export function tzAbbrev(at: string | Date, timezone: string) {
  return formatInTimeZone(at, timezone, "zzz");
}

/** "2h 14m", "14m", "45s" */
export function formatDuration(ms: number) {
  if (ms <= 0) return "0s";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Totals can go negative in minus-points pools: "−17" with a true minus sign. */
export function points(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  const abs = Number.isInteger(v) ? String(Math.abs(v)) : Math.abs(v).toFixed(1);
  return v < 0 ? `${MINUS}${abs}` : abs;
}

/** "+5" / "−5" / "0" for one pick's points. */
export function signedPoints(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return v > 0 ? `+${points(v)}` : points(v);
}
