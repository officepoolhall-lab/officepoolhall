import { describe, expect, it } from "vitest";
import { isGamblingStory } from "./newsFilter";

const story = (headline: string, url = "https://www.cbssports.com/nfl/news/x/", description: string | null = null) => ({ headline, url, description });

describe("isGamblingStory", () => {
  it("leaves out sportsbook promotions and betting stories", () => {
    expect(isGamblingStory(story("DraftKings promo code: Bet $5, get $200 in bonus bets for Eagles-Cowboys"))).toBe(true);
    expect(isGamblingStory(story("NFL Week 12 picks, predictions, odds: Expert says fade the Bills"))).toBe(true);
    expect(isGamblingStory(story("Best player props for Sunday Night Football"))).toBe(true);
    expect(isGamblingStory(story("NFL best bets for Week 12"))).toBe(true);
    expect(isGamblingStory(story("Chiefs vs. Raiders spread picks"))).toBe(true);
    expect(isGamblingStory(story("Anything", "https://www.foxsports.com/stories/betting/nfl-week-12-lines"))).toBe(true);
    expect(isGamblingStory(story("Masters 2027 odds: Scheffler opens as favorite"))).toBe(true);
  });

  it("keeps ordinary news", () => {
    expect(isGamblingStory(story("Eagles beat Cowboys on late field goal"))).toBe(false);
    expect(isGamblingStory(story("Ohio State moves to No. 1 in the College Football Playoff rankings"))).toBe(false);
    expect(isGamblingStory(story("Scheffler wins the RSM Classic after weather delay"))).toBe(false);
    expect(isGamblingStory(story("Duke freshman's propensity for big moments"))).toBe(false);
    expect(isGamblingStory(story("Bills bet on youth at receiver"))).toBe(false);
  });
});
