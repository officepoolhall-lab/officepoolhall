import { formatInTimeZone } from "date-fns-tz";
import type { ApPoll } from "@/lib/apPoll";
import { SectionLabel, TeamLogo } from "./ui";

/** The AP Top 25 as compact rows: rank, logo, team, record and the move since last week. */
export function ApPollList({ poll, timezone }: { poll: ApPoll | null; timezone: string }) {
  return (
    <section aria-labelledby="ap-poll">
      <div className="flex min-h-11 items-baseline justify-between gap-3">
        <SectionLabel>
          <span id="ap-poll">AP Top 25</span>
          {poll && <span className="font-normal normal-case tracking-normal"> · {poll.label}</span>}
        </SectionLabel>
        {poll?.date && <span className="text-xs text-muted">Released {formatInTimeZone(poll.date, timezone, "MMM d")}</span>}
      </div>
      {!poll ? (
        <p className="border-y border-line py-3 text-sm text-muted">The poll isn&apos;t available right now. Check back soon.</p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {poll.teams.map((t) => {
            const move = t.previous === null ? null : t.previous - t.rank;
            return (
              <li key={`${t.rank}-${t.abbreviation}`} className="flex min-h-9 items-center gap-2.5 py-1.5 text-sm">
                <span className="w-6 text-right tabular-nums text-muted">{t.rank}</span>
                <TeamLogo src={t.logo} abbr={t.abbreviation} className="size-5" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {t.name}
                  {t.firstPlaceVotes > 0 && <span className="ml-1.5 text-xs font-normal tabular-nums text-muted">({t.firstPlaceVotes})</span>}
                </span>
                {t.record && <span className="text-xs tabular-nums text-muted">{t.record}</span>}
                {/* Movement since last week: up in win green, down in loss red, NEW when unranked before. */}
                <span
                  className={`w-9 text-right text-xs font-semibold tabular-nums ${
                    move === null ? "text-accent" : move > 0 ? "text-win" : move < 0 ? "text-loss" : "text-faint"
                  }`}
                >
                  {move === null ? "NEW" : move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : "–"}
                  <span className="sr-only">
                    {move === null ? ", new this week" : move > 0 ? `, up ${move}` : move < 0 ? `, down ${-move}` : ", unchanged"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
