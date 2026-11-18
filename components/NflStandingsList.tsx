import type { NflGroup, NflStandings } from "@/lib/nflStandings";
import { SectionLabel, TeamLogo } from "./ui";
import { ConferenceTabs } from "./ConferenceTabs";

const pctText = (p: number) => (p >= 1 ? "1.000" : p.toFixed(3).replace(/^0/, ""));

/** NFL division standings for Home (where college pools show the poll): AFC and NFC behind two tabs. */
export function NflStandingsList({ standings }: { standings: NflStandings | null }) {
  return (
    <section aria-labelledby="nfl-standings">
      <div className="flex min-h-11 items-baseline justify-between gap-3">
        <SectionLabel className="!text-sm lg:!text-base">
          <span id="nfl-standings">NFL Standings</span>
        </SectionLabel>
      </div>
      {!standings ? (
        <p className="border-y border-line py-3 text-sm text-muted">Standings aren&apos;t available right now. Check back soon.</p>
      ) : (
        <ConferenceTabs
          views={standings.conferences.map((c) => ({
            id: c.shortName.toLowerCase(),
            label: c.shortName,
            content: (
              <div className="space-y-3">
                {c.divisions.map((d) => (
                  <Division key={d.name} group={d} />
                ))}
              </div>
            ),
          }))}
        />
      )}
    </section>
  );
}

function Division({ group }: { group: NflGroup }) {
  return (
    // Each division in its own thin blue box, so the four don't run together.
    <div className="overflow-hidden rounded-lg border border-accent">
      <div className="flex items-end gap-2.5 border-b border-line bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-muted">
        <span className="min-w-0 flex-1 font-semibold uppercase tracking-wide">{group.name}</span>
        <span className="w-14 text-right">W–L</span>
        <span className="w-10 text-right">Pct</span>
        <span className="w-8 text-right">Strk</span>
      </div>
      <ol className="divide-y divide-line">
        {group.teams.map((t) => (
          <li key={t.abbreviation || t.name} className="flex min-h-9 items-center gap-2.5 px-2.5 py-1.5 text-sm">
            <TeamLogo src={t.logo} abbr={t.abbreviation} className="size-5" />
            <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
            <span className="w-14 text-right text-xs font-semibold tabular-nums">
              {t.wins}–{t.losses}
              {t.ties ? `–${t.ties}` : ""}
            </span>
            <span className="w-10 text-right text-xs tabular-nums text-muted">{pctText(t.pct)}</span>
            <span className={`w-8 text-right text-xs tabular-nums ${t.streak?.startsWith("W") ? "text-win" : t.streak?.startsWith("L") ? "text-loss" : "text-muted"}`}>
              {t.streak ?? ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
