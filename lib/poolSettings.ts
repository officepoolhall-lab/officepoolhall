import { z } from "zod";

// Everything that varies by pool lives in pools.settings (HANDOFF.md §5).
// The database trusts this shape, so every write goes through parsePoolSettings().

const tier = z.object({
  points: z.number().int().min(1).max(10),
  count: z.number().int().min(1),
});

export const poolSettingsSchema = z
  .object({
    pick_type: z.enum(["straight_up", "ats"]),
    picks_per_slate: z.number().int().min(1).max(100),
    picks_mode: z.enum(["exact", "max"]),
    confidence: z.object({ tiers: z.array(tier).min(1) }).nullable(),
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
          time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM"),
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
  });

export type PoolSettings = z.infer<typeof poolSettingsSchema>;

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
      confidence: { tiers: evenTiers(35) },
      scoring: { win: 1, push: 0, loss: 0 },
      lock: { mode: "per_game" },
      timezone: "America/Chicago",
      // TODO(brooks): week window defaults to Monday 00:00 – Sunday 23:59 Central.
      window: { start_weekday: 1, length_days: 7 },
      lines: { bookmaker: "draftkings", freeze_at: "publish", force_half_point: false },
      visibility: { show_picks_after: "game_start" },
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

/** Settings fields that can't change once any slate has opened (also enforced by a DB trigger). */
export const LOCKED_AFTER_OPEN = ["pick_type", "picks_per_slate", "confidence"] as const;
