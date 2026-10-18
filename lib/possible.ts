/**
 * Most points a player can still finish the week with: what they have now, plus what every
 * undecided pick would earn if it wins, plus their unused pick slots placed on the games that
 * are still open (highest values first). Upset bonuses aren't counted until they're earned.
 *
 * Only the picks the viewer can see go in: before a game locks, RLS hides other players'
 * picks, so their slots on open games count as unused, which comes out the same.
 */
export function possiblePoints({
  points,
  picks,
  openGameIds,
  slotValues,
}: {
  /** The player's current week total (slate_scores.points, bonus included). */
  points: number;
  /** The player's visible picks this week. result null = not decided yet. */
  picks: { game_id: string; confidence: number | null; result: string | null }[];
  /** Games still open for picking (not locked, not voided). */
  openGameIds: string[];
  /**
   * What a win is worth for each pick slot: the confidence tiers expanded (2×5, 2×4 → 5,5,4,4)
   * or, without tiers, the flat win value once per pick.
   */
  slotValues: number[];
}): number {
  // Slots not spent yet. A confidence pick spends the slot with its value; a flat pick spends any.
  const unused = [...slotValues].sort((a, b) => b - a);
  const spend = (value: number | null) => {
    const i = value === null ? 0 : unused.indexOf(value);
    // A value the tiers don't have (settings changed mid-week) still uses up a slot.
    if (i >= 0) unused.splice(i, 1);
    else unused.pop();
  };

  let pending = 0;
  const picked = new Set<string>();
  for (const p of picks) {
    picked.add(p.game_id);
    const flatValue = unused[0] ?? 0;
    spend(p.confidence);
    if (p.result === null) pending += p.confidence ?? flatValue;
  }

  // Unused slots can only go on open games the player hasn't picked yet.
  const openSlots = openGameIds.filter((id) => !picked.has(id)).length;
  const later = unused.slice(0, openSlots).reduce((sum, v) => sum + v, 0);

  return points + pending + later;
}

/** One win value per pick slot, from the pool's settings. */
export function slotValuesFor(settings: {
  picks_per_slate: number;
  confidence: { tiers: { points: number; count: number }[] } | null;
  scoring: { win: number };
}): number[] {
  if (settings.confidence) return settings.confidence.tiers.flatMap((t) => Array<number>(t.count).fill(t.points));
  return Array<number>(settings.picks_per_slate).fill(settings.scoring.win);
}
