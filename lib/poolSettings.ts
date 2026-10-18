import { z } from "zod";

// Everything that varies by pool lives in pools.settings (HANDOFF.md §5).
// The database trusts this shape, so every write goes through parsePoolSettings().

const tier = z.object({
  points: z.number().int().min(1).max(10),
  count: z.number().int().min(1),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

// A bonus tier pays when the pool's majority side holds MORE than min_share of the
// points on a game (strictly greater, so exactly 80% falls in the lower bracket).
const upsetTier = z.object({
  min_share: z.number().gt(0.5, "Share must be above 50%").lt(1, "Share must be below 100%"),
  bonus: z.number().positive().max(100),
});

const segment = z.object({
  name: z.string().trim().min(1, "Segment needs a name"),
  first_week: z.number().int().min(1),
});

export const poolSettingsSchema = z
  .object({
    pick_type: z.enum(["straight_up", "ats"]),
    picks_per_slate: z.number().int().min(1).max(100),
    picks_mode: z.enum(["exact", "max"]),
    // A player's picks only save as a full card (picks_per_slate at once), never part-way.
    // Later edits are still per game: picks on locked games stay, open ones can be swapped.
    // The commissioner's on-behalf edits are exempt. Defaults keep older pools as they were.
    full_card: z.boolean().default(false),
    confidence: z
      .object({
        tiers: z.array(tier).min(1),
        // "zero": a wrong pick scores nothing; "minus_points": it costs its confidence value.
        wrong_pick: z.enum(["zero", "minus_points"]).default("zero"),
      })
      .nullable(),
    // Points for correctly picking the side the pool was against (RULES.md "Upset bonus").
    // null = no bonus. Defaults keep pools saved before these keys existed working.
    upset_bonus: z.object({ tiers: z.array(upsetTier).min(1) }).nullable().default(null),
    // A member with no picks on a slate: "zero", or the week's lowest total among members who picked.
    missed_week: z.enum(["zero", "last_place"]).default("zero"),
    scoring: z.object({
      win: z.number().min(0),
      push: z.number().min(0),
      loss: z.number(),
    }),
    lock: z.object({
      mode: z.enum(["per_game", "weekly"]),
      weekly: z
        .object({
          weekday: z.number().int().min(0).max(6), // 0 = Sunday
          time: hhmm,
          // Earlier deadline for the games on the window's first day (Pool A: Monday 5pm),
          // pulled earlier still by that day's first tip. Absent = one deadline for everything.
          first_day_time: hhmm.optional(),
        })
        .optional(),
    }),
    timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
    window: z.object({
      start_weekday: z.number().int().min(0).max(6),
      length_days: z.number().int().min(1).max(14),
    }),
    lines: z.object({
      bookmaker: z.string().min(1),
      freeze_at: z.literal("publish"),
      force_half_point: z.boolean(),
    }),
    visibility: z.object({ show_picks_after: z.enum(["game_start", "lock"]) }),
    // The season split into segments with their own standings (Supercontest: weeks 1–5, 6–10,
    // 11–end). Each runs from its first_week to the week before the next one's; the last is open-ended.
    // null = no segments. Not locked after open: commissioners may move the boundaries.
    segments: z.array(segment).min(1).nullable().default(null),
  })
  .superRefine((s, ctx) => {
    if (s.confidence) {
      const total = s.confidence.tiers.reduce((sum, t) => sum + t.count, 0);
      if (total !== s.picks_per_slate) {
        ctx.addIssue({
          code: "custom",
          path: ["confidence", "tiers"],
          message: `Tier counts add up to ${total} but picks per slate is ${s.picks_per_slate}`,
        });
      }
      const points = s.confidence.tiers.map((t) => t.points);
      if (new Set(points).size !== points.length) {
        ctx.addIssue({ code: "custom", path: ["confidence", "tiers"], message: "Each tier needs a different point value" });
      }
    }
    if (s.lock.mode === "weekly" && !s.lock.weekly) {
      ctx.addIssue({ code: "custom", path: ["lock", "weekly"], message: "Weekly lock needs a day and time" });
    }
    if (s.lock.mode !== "weekly" && s.lock.weekly?.first_day_time) {
      ctx.addIssue({
        code: "custom",
        path: ["lock", "weekly", "first_day_time"],
        message: "A first-day deadline only applies to a weekly lock",
      });
    }
    if (s.upset_bonus) {
      const shares = s.upset_bonus.tiers.map((t) => t.min_share);
      if (shares.some((share, i) => i > 0 && share <= shares[i - 1])) {
        ctx.addIssue({
          code: "custom",
          path: ["upset_bonus", "tiers"],
          message: "Upset bonus tiers need increasing shares",
        });
      }
    }
    if (s.segments) {
      const weeks = s.segments.map((x) => x.first_week);
      if (weeks.some((w, i) => i > 0 && w <= weeks[i - 1])) {
        ctx.addIssue({ code: "custom", path: ["segments"], message: "Segments need increasing start weeks" });
      }
    }
  });

/** Parsed settings: every defaulted key is present. */
export type PoolSettings = z.infer<typeof poolSettingsSchema>;
/** What may be stored or submitted: keys added after launch can be missing. */
export type PoolSettingsInput = z.input<typeof poolSettingsSchema>;

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Seven 5s, seven 4s, … — or five of each when picksPerSlate is 25. */
export function evenTiers(picksPerSlate: number, values = [5, 4, 3, 2, 1]) {
  const per = Math.floor(picksPerSlate / values.length);
  return values.map((points) => ({ points, count: per }));
}

// Kept out of the `as const` preset object so the array stays mutable (PoolSettings expects one).
// TODO(brooks): exactly 80/90/95% gets the lower bracket (> 80% needed for +1), and shares are
// by confidence points, not by number of players — confirm both.
const POOL_A_UPSET_TIERS = [
  { min_share: 0.8, bonus: 1 },
  { min_share: 0.9, bonus: 2 },
  { min_share: 0.95, bonus: 3 },
];

export const PRESETS = {
  // Pool A — NCAAB Confidence Pool
  // TODO(brooks): 35 or 25 picks? 35 = 7 per tier; switch picks_per_slate to 25 for 5 per tier.
  ncaab_confidence: {
    label: "NCAAB Confidence Pool",
    sport: "ncaab",
    settings: {
      pick_type: "straight_up",
      picks_per_slate: 35,
      picks_mode: "exact",
      // Correct pick = +its points, incorrect = −its points.
      confidence: { tiers: evenTiers(35), wrong_pick: "minus_points" },
      // Flat scoring is unused with confidence tiers but kept for the schema.
      scoring: { win: 1, push: 0, loss: 0 },
      upset_bonus: { tiers: POOL_A_UPSET_TIERS },
      missed_week: "last_place",
      full_card: false,
      segments: null,
      // Brooks: every pick is due Wednesday at noon Central; games before then lock at tip-off.
      // (first_day_time can add an earlier deadline for the week's first day if that changes.)
      lock: { mode: "weekly", weekly: { weekday: 3, time: "12:00" } },
      timezone: "America/Chicago",
      // TODO(brooks): week window defaults to Monday 00:00 – Sunday 23:59 Central.
      window: { start_weekday: 1, length_days: 7 },
      lines: { bookmaker: "draftkings", freeze_at: "publish", force_half_point: false },
      // Everyone's picks on a game are shown once it locks, for auditing.
      visibility: { show_picks_after: "lock" },
    },
  },
  // Pool B — NCAAF Supercontest
  ncaaf_ats: {
    label: "NCAAF Supercontest (ATS)",
    sport: "ncaaf",
    settings: {
      pick_type: "ats",
      picks_per_slate: 5,
      picks_mode: "exact",
      confidence: null,
      scoring: { win: 1, push: 0.5, loss: 0 },
      upset_bonus: null,
      missed_week: "zero",
      full_card: true,
      segments: null,
      lock: { mode: "per_game" },
      timezone: "America/Chicago",
      window: { start_weekday: 1, length_days: 7 },
      lines: { bookmaker: "draftkings", freeze_at: "publish", force_half_point: false },
      visibility: { show_picks_after: "game_start" },
    },
  },
} as const satisfies Record<string, { label: string; sport: "ncaab" | "ncaaf"; settings: PoolSettings }>;

export type PresetKey = keyof typeof PRESETS;

export function parsePoolSettings(input: unknown) {
  return poolSettingsSchema.safeParse(input);
}

/** First validation error as a sentence, for form feedback. */
export function settingsError(input: unknown): string | null {
  const r = parsePoolSettings(input);
  if (r.success) return null;
  const issue = r.error.issues[0];
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

export type SegmentRange = { name: string; first_week: number; last_week: number | null };

/**
 * Each segment with the week range it covers. last_week is null for the final, open-ended segment,
 * unless maxWeek is given (e.g. the latest published week), which caps it.
 */
export function segmentRanges(settings: Pick<PoolSettings, "segments">, maxWeek?: number): SegmentRange[] {
  const segs = settings.segments ?? [];
  return segs.map((seg, i) => {
    const next = segs[i + 1];
    const last = next ? next.first_week - 1 : maxWeek !== undefined ? Math.max(maxWeek, seg.first_week) : null;
    return { name: seg.name, first_week: seg.first_week, last_week: last };
  });
}

/** The segment a week falls in, or null (no segments, or a week before the first one starts). */
export function segmentForWeek(settings: Pick<PoolSettings, "segments">, week: number): SegmentRange | null {
  return segmentRanges(settings).find((r) => week >= r.first_week && (r.last_week === null || week <= r.last_week)) ?? null;
}

/** "Wks 1–5", "Wk 11", "Wks 11+" */
export function segmentWeeksLabel(r: SegmentRange) {
  if (r.last_week === null) return `Wks ${r.first_week}+`;
  return r.last_week === r.first_week ? `Wk ${r.first_week}` : `Wks ${r.first_week}–${r.last_week}`;
}

/** "1, 6, 11" → Segment 1 from week 1, Segment 2 from week 6, … ; blank → no segments. */
export function parseSegmentWeeks(text: string): { segments: PoolSettings["segments"]; error: string | null } {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (!parts.length) return { segments: null, error: null };
  const weeks = parts.map(Number);
  const segments = weeks.map((first_week, i) => ({ name: `Segment ${i + 1}`, first_week }));
  if (weeks.some((w) => !Number.isInteger(w) || w < 1)) return { segments, error: "Use whole week numbers, like 1, 6, 11" };
  if (weeks.some((w, i) => i > 0 && w <= weeks[i - 1])) return { segments, error: "List start weeks in increasing order" };
  return { segments, error: null };
}

/**
 * Settings fields that can't change once any slate has opened (also enforced by a DB trigger).
 * confidence covers wrong_pick; upset_bonus and missed_week change what past weeks would have
 * scored, so regrading a slate mid-season would rewrite the standings.
 */
export const LOCKED_AFTER_OPEN = ["pick_type", "picks_per_slate", "confidence", "upset_bonus", "missed_week"] as const;
