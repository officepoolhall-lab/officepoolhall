import { TeamLogo } from "./ui";

type Team = { name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null; espn_id?: string | null };

/**
 * One-line matchup with the team logos as bookends: [away logo] Away @ Home [home logo].
 * Neutral-site games read "vs" (the first-listed team is the away team).
 */
export function Matchup({
  away,
  home,
  awayRank,
  homeRank,
  neutral,
  logoClass = "size-6",
  records,
}: {
  away: Team;
  home: Team;
  awayRank?: number | null;
  homeRank?: number | null;
  neutral: boolean;
  logoClass?: string;
  /** ESPN team id → overall record ("6-0"), shown after each name when known. */
  records?: Record<string, string>;
}) {
  const rank = (r?: number | null) => r && <span className="mr-1 text-xs font-medium text-muted tabular-nums">{r}</span>;
  const record = (t: Team) => {
    const r = t.espn_id ? records?.[t.espn_id] : undefined;
    return r ? <span className="ml-1 text-xs font-normal text-muted tabular-nums">{r.replace(/-/g, "–")}</span> : null;
  };
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamLogo src={away.logo_url} abbr={away.abbreviation} className={logoClass} />
      <span className="min-w-0 truncate text-[15px] font-semibold">
        {rank(awayRank)}
        {away.short_name ?? away.name}
        {record(away)} <span className="font-normal text-muted">{neutral ? "vs" : "@"}</span>{" "}
        {rank(homeRank)}
        {home.short_name ?? home.name}
        {record(home)}
      </span>
      <TeamLogo src={home.logo_url} abbr={home.abbreviation} className={logoClass} />
    </span>
  );
}
