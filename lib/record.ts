/** Wins over decided picks, baseball style: .667, 1.000; — before any are decided. */
export function winPct(wins: number, losses: number) {
  const decided = wins + losses;
  if (!decided) return "—";
  const pct = (wins / decided).toFixed(3);
  return pct.startsWith("0") ? pct.slice(1) : pct;
}
