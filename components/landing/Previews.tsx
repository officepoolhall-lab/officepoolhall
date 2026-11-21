// Mock views of the app for the landing page: made-up teams, names and numbers, drawn with the
// same tokens and shapes as the real pages (cells, hairline rows, live status) but static.

type Team = { abbr: string; name: string; color: string; record: string };

function Badge({ team, size = "size-7" }: { team: Team; size?: string }) {
  return (
    <span
      aria-hidden
      className={`${size} inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white`}
      style={{ background: team.color }}
    >
      {team.abbr.slice(0, 3)}
    </span>
  );
}

const T = {
  hawks: { abbr: "HWK", name: "Hawks", color: "#b45309", record: "8-2" },
  pines: { abbr: "PIN", name: "Pines", color: "#15803d", record: "6-4" },
  rams: { abbr: "RAM", name: "Rams", color: "#1d4ed8", record: "9-1" },
  tides: { abbr: "TID", name: "Tides", color: "#0e7490", record: "5-5" },
  owls: { abbr: "OWL", name: "Owls", color: "#7c3aed", record: "7-3" },
  bears: { abbr: "BRS", name: "Bears", color: "#9f1239", record: "4-6" },
} satisfies Record<string, Team>;

/** A slice of My Picks: two games, one picked, one live. */
export function PicksPreview() {
  const game = (
    away: Team,
    home: Team,
    status: { text: string; live?: boolean },
    spreadAway: string,
    spreadHome: string,
    picked: "away" | "home" | null,
    score?: [number, number],
  ) => (
    <div className="py-3">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${status.live ? "text-live" : "text-muted"}`}>
        {status.live && <span className="size-1.5 rounded-full bg-live" />}
        {status.text}
      </div>
      {([
        [away, spreadAway, "away", score?.[0]],
        [home, spreadHome, "home", score?.[1]],
      ] as const).map(([team, spread, side, pts]) => {
        const on = picked === side;
        return (
          <div key={side} className="flex items-center gap-3 py-1">
            <Badge team={team} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold leading-tight">{team.name}</div>
              <div className="text-xs text-muted">{team.record}</div>
            </div>
            {pts !== undefined && <div className="w-6 text-right font-semibold tabular-nums">{pts}</div>}
            <div
              className={`flex h-10 w-[4.5rem] items-center justify-center rounded-[10px] text-[15px] font-semibold tabular-nums ${
                on ? "bg-accent/15 text-accent ring-1 ring-accent" : "bg-surface text-ink"
              }`}
            >
              {spread}
            </div>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="rounded-2xl bg-bg p-4 shadow-[0_1px_0_var(--line),0_12px_40px_-12px_rgba(0,0,0,0.25)] ring-1 ring-line">
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">My Picks</div>
          <div className="text-lg font-bold leading-tight">Week 12</div>
        </div>
        <div className="text-sm font-semibold tabular-nums text-accent">3/5 picked</div>
      </div>
      <div className="divide-y divide-line">
        {game(T.hawks, T.rams, { text: "Q3 · 6:12", live: true }, "+6.5", "−6.5", "home", [17, 24])}
        {game(T.pines, T.tides, { text: "Sat 2:30 PM · Locks in 3h" }, "−3", "+3", null)}
      </div>
    </div>
  );
}

/** A slice of the League Grid: players down the side, games across. */
export function GridPreview() {
  const games = [T.rams, T.owls, T.pines, T.bears, T.tides];
  const rows: { name: string; pts: string; picks: (0 | 1 | 2)[] }[] = [
    { name: "Megan R.", pts: "41", picks: [1, 1, 2, 1, 0] },
    { name: "Dave K.", pts: "39.5", picks: [1, 0, 1, 1, 2] },
    { name: "Priya S.", pts: "38", picks: [1, 1, 0, 2, 1] },
    { name: "Tom B.", pts: "36", picks: [0, 1, 1, 1, 0] },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-bg p-4 ring-1 ring-line">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">League Grid</div>
        <div className="text-xs text-muted">Week 12</div>
      </div>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="w-[38%] pb-2 text-left font-medium">Player</th>
            <th className="w-12 pb-2 text-right font-medium">Pts</th>
            {games.map((g) => (
              <th key={g.abbr} className="pb-2">
                <div className="flex justify-center">
                  <Badge team={g} size="size-6" />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="truncate py-2 font-semibold">{r.name}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{r.pts}</td>
              {r.picks.map((p, i) => (
                <td key={i} className="px-0.5 py-1.5">
                  <div
                    className={`mx-auto h-7 max-w-10 rounded-md ${
                      p === 1 ? "bg-[var(--win-fill)] shadow-[inset_0_-2px_0_var(--win)]" : p === 2 ? "bg-[var(--loss-fill)] shadow-[inset_0_-2px_0_var(--loss)]" : "bg-surface"
                    }`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Season standings. */
export function StandingsPreview() {
  const rows = [
    ["1", "Megan R.", "38-17-1", "41"],
    ["2", "Dave K.", "37-18-1", "39.5"],
    ["3", "Priya S.", "36-19-1", "38"],
    ["T4", "Tom B.", "34-21-1", "36"],
    ["T4", "Alex M.", "34-21-1", "36"],
  ];
  return (
    <div className="rounded-2xl bg-bg p-4 ring-1 ring-line">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Standings</div>
      <div className="divide-y divide-line">
        {rows.map(([rank, name, rec, pts], i) => (
          <div key={name} className={`flex items-center gap-3 py-2.5 text-sm ${i === 2 ? "-mx-2 rounded-lg bg-accent/10 px-2" : ""}`}>
            <span className="w-6 text-right tabular-nums text-muted">{rank}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
            <span className="tabular-nums text-muted">{rec}</span>
            <span className="w-10 text-right font-semibold tabular-nums">{pts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A golf leaderboard with the viewer's golfers marked. */
export function GolfPreview() {
  const rows: [string, string, string, string, boolean][] = [
    ["1", "J. Thornton", "−14", "F", false],
    ["T2", "M. Alvarez", "−12", "16", true],
    ["T2", "S. Okafor", "−12", "F", false],
    ["4", "R. Lindqvist", "−11", "14", true],
    ["T5", "D. Park", "−10", "2:40 PM", false],
  ];
  return (
    <div className="rounded-2xl bg-bg p-4 ring-1 ring-line">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Leaderboard</div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-live">
          <span className="size-1.5 rounded-full bg-live" />
          Live · Round 3
        </div>
      </div>
      <div className="divide-y divide-line">
        {rows.map(([pos, name, score, thru, mine]) => (
          <div key={name} className={`flex items-center gap-3 py-2.5 text-sm ${mine ? "border-l-2 border-l-accent pl-2" : "pl-2.5"}`}>
            <span className="w-7 tabular-nums text-muted">{pos}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
            <span className="w-10 text-right font-semibold tabular-nums">{score}</span>
            <span className="w-16 text-right text-xs tabular-nums text-muted">{thru}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
