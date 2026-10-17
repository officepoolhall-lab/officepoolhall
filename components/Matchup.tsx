import { TeamLogo } from "./ui";

type Team = { name: string; short_name: string | null; abbreviation: string | null; logo_url: string | null };

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
}: {
  away: Team;
  home: Team;
  awayRank?: number | null;
  homeRank?: number | null;
  neutral: boolean;
  logoClass?: string;
}) {
  const rank = (r?: number | null) => r && <span className="mr-1 text-xs font-medium text-muted tabular-nums">{r}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamLogo src={away.logo_url} abbr={away.abbreviation} className={logoClass} />
      <span className="min-w-0 truncate text-[15px] font-semibold">
        {rank(awayRank)}
        {away.short_name ?? away.name} <span className="font-normal text-muted">{neutral ? "vs" : "@"}</span>{" "}
        {rank(homeRank)}
        {home.short_name ?? home.name}
      </span>
      <TeamLogo src={home.logo_url} abbr={home.abbreviation} className={logoClass} />
    </span>
  );
}
