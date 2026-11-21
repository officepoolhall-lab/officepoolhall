// Stories about betting stay off the site: sportsbook promotions, odds and betting picks, and
// gambling ads dressed as articles. Checked against the headline, the summary and the link
// (the big sites keep these under /betting/ or /sportsbooks/).

const WORDS = [
  // Sportsbooks and their promotions
  /\bsports ?books?\b/i,
  /\b(promo|bonus|referral) codes?\b/i,
  /\b(draftkings|fanduel|betmgm|bet ?365|caesars sportsbook|espn ?bet|fanatics sportsbook|betrivers|hard rock bet|bally ?bet|betway|pointsbet|prizepicks|underdog fantasy|kalshi|polymarket)\b/i,
  /\bfree bets?\b/i,
  /\bbet \$?\d+,? (get|win)\b/i,
  // Betting itself
  /\bbett?ing\b/i,
  /\b(best|bonus|prop|player|same.game|sharp|lock of the week) bets?\b/i,
  /\bbets? (of the (day|week)|to make)\b/i,
  /\bwagers?\b/i,
  /\bgambl(e|ing|er)\b/i,
  /\bparlays?\b/i,
  /\bodds\b/i,
  /\b(player )?props?\b(?! (up|to))/i,
  /\bover\/under\b/i,
  /\bmoney ?lines?\b/i,
  /\b(spread|ats) picks?\b/i,
  /\bpicks?,? (and )?predictions?\b/i,
  /\bcasinos?\b/i,
];

const PATHS = /\/(betting|sportsbooks?|gambling|odds|bonus-codes?|promo-codes?|picks-and-predictions)(\/|-|$)/i;

/** True for a story about betting or a sportsbook (left out of the news). */
export function isGamblingStory(s: { headline: string; description?: string | null; url: string }): boolean {
  if (PATHS.test(s.url)) return true;
  const text = `${s.headline} ${s.description ?? ""}`;
  return WORDS.some((w) => w.test(text));
}
