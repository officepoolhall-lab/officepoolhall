import { TeamLogo, SectionLabel } from "@/components/ui";
import type { PlayoffGame, PlayoffTeam, Seeded } from "@/lib/nflPlayoffs";

// The playoff bracket for Playoff Fantasy's Home: each conference's Wild Card, Divisional and
// Championship rounds, then the Super Bowl. Until the season ends it's the field as the
// standings stand today; rounds not set yet show who they'll be ("Lowest seed left").

type Picture = { AFC: Seeded[]; NFC: Seeded[] };
type Side = { team: Seeded | null; label?: string; score?: number | null; won?: boolean; lost?: boolean };
type Game = { away: Side; home: Side; state: "pre" | "in" | "post" | "tbd" };

const tbd = (label: string): Side => ({ team: null, label });

/** A real game between these two teams, if ESPN lists one in that round. */
function findGame(games: PlayoffGame[], round: number, a: string, b: string) {
  return games.find((g) => g.round === round && g.teams.some((t) => t.espnId === a) && g.teams.some((t) => t.espnId === b));
}

/** The bracket game between two seeded teams, with ESPN's score and result when it's been played. */
function seededGame(games: PlayoffGame[], round: number, away: Seeded, home: Seeded): Game {
  const g = findGame(games, round, away.espnId, home.espnId);
  const side = (t: Seeded): Side => {
    const r: PlayoffTeam | undefined = g?.teams.find((x) => x.espnId === t.espnId);
    return { team: t, score: g && g.state !== "pre" ? (r?.score ?? null) : null, won: g?.state === "post" && r ? !r.lost : false, lost: g?.state === "post" && Boolean(r?.lost) };
  };
  // ESPN's home team when it lists the game (the Super Bowl's is assigned).
  const espnHome = g?.teams.find((x) => x.homeAway === "home")?.espnId;
  const flip = espnHome === away.espnId;
  return { away: side(flip ? home : away), home: side(flip ? away : home), state: g?.state ?? "pre" };
}

const winner = (g: Game) => (g.state === "post" ? (g.home.won ? g.home.team : g.away.won ? g.away.team : null) : null);

/** One conference's three rounds. */
function conference(seeds: Seeded[], games: PlayoffGame[]) {
  const s = (n: number) => seeds.find((t) => t.seed === n)!;
  const wild = [seededGame(games, 0, s(7), s(2)), seededGame(games, 0, s(6), s(3)), seededGame(games, 0, s(5), s(4))];
  const wcWinners = wild.map(winner);
  let div: Game[];
  if (wcWinners.every(Boolean)) {
    // Reseeded: the 1 seed hosts the lowest seed left; the other two meet at the higher seed.
    const left = (wcWinners as Seeded[]).sort((a, b) => a.seed - b.seed);
    div = [seededGame(games, 1, left[2], s(1)), seededGame(games, 1, left[1], left[0])];
  } else {
    div = [
      { away: tbd("Lowest seed left"), home: { team: s(1) }, state: "tbd" },
      { away: tbd("Wild Card winner"), home: tbd("Wild Card winner"), state: "tbd" },
    ];
  }
  const divWinners = div.map((g) => (g.state === "tbd" ? null : winner(g)));
  const champ: Game =
    divWinners.every(Boolean)
      ? (() => {
          const [a, b] = (divWinners as Seeded[]).sort((x, y) => x.seed - y.seed);
          return seededGame(games, 2, b, a);
        })()
      : { away: tbd("Divisional winner"), home: tbd("Divisional winner"), state: "tbd" };
  return { wild, bye: s(1), div, champ, champion: champ.state === "tbd" ? null : winner(champ) };
}

function TeamLine({ side, out }: { side: Side; out: Set<string> }) {
  if (!side.team) {
    return (
      <div className="flex h-6 items-center gap-1.5 px-2 text-[11px] italic text-faint">
        <span className="truncate">{side.label ?? "TBD"}</span>
      </div>
    );
  }
  const t = side.team;
  const gone = side.lost || out.has(t.espnId);
  return (
    <div className={`flex h-6 min-w-0 items-center gap-1.5 px-2 text-xs ${gone ? "text-muted" : "text-ink"}`}>
      <span className="w-3 shrink-0 text-right text-[10px] font-semibold tabular-nums text-muted">{t.seed}</span>
      <TeamLogo src={t.logo} abbr={t.abbreviation} className="size-4 shrink-0" />
      <span className={`min-w-0 flex-1 truncate ${side.won ? "font-extrabold" : "font-medium"} ${gone ? "line-through decoration-1" : ""}`}>{t.name}</span>
      {side.score != null && <span className={`shrink-0 tabular-nums ${side.won ? "font-extrabold" : ""}`}>{side.score}</span>}
    </div>
  );
}

function GameBox({ g, out, live = false }: { g: Game; out: Set<string>; live?: boolean }) {
  return (
    <div className={`divide-y divide-line overflow-hidden rounded-lg bg-surface ring-1 ${g.state === "in" || live ? "ring-live" : "ring-line"}`}>
      <TeamLine side={g.away} out={out} />
      <TeamLine side={g.home} out={out} />
    </div>
  );
}

const ROUND_LABELS = ["Wild Card", "Divisional", "Conference"];

export function PfBracket({ picture, games, out, projected }: { picture: Picture; games: PlayoffGame[]; out: Set<string>; projected: boolean }) {
  const confs = (["AFC", "NFC"] as const).map((c) => ({ c, ...conference(picture[c], games) }));
  const afc = confs[0];
  const nfc = confs[1];
  const sbReal = afc.champion && nfc.champion ? seededGame(games, 3, afc.champion, nfc.champion) : null;
  const sb: Game = sbReal ?? { away: afc.champion ? { team: afc.champion } : tbd("AFC champion"), home: nfc.champion ? { team: nfc.champion } : tbd("NFC champion"), state: "tbd" };
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel fit className="!text-sm lg:!text-base">Playoff Bracket</SectionLabel>
        {projected && <span className="shrink-0 text-xs text-muted">If the season ended today</span>}
      </div>
      <div className="mt-3 space-y-5">
        {confs.map(({ c, wild, bye, div, champ }) => (
          <div key={c}>
            <div className="mb-1.5 text-xs font-bold tracking-wide text-muted">{c}</div>
            <div className="grid grid-cols-3 gap-2 text-[10px] font-semibold uppercase tracking-wide text-faint">
              {ROUND_LABELS.map((r) => (
                <div key={r}>{r}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {/* Wild Card: three games and the 1 seed's bye. */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-1 rounded-lg px-0.5 py-1">
                  <div className="min-w-0 flex-1">
                    <TeamLine side={{ team: bye }} out={out} />
                  </div>
                  <span className="shrink-0 pr-2 text-[10px] font-semibold uppercase tracking-wide text-muted">Bye</span>
                </div>
                {wild.map((g, i) => (
                  <GameBox key={i} g={g} out={out} />
                ))}
              </div>
              {/* Divisional: two games, spread to sit between the games that feed them. */}
              <div className="flex flex-col justify-around gap-1.5">
                {div.map((g, i) => (
                  <GameBox key={i} g={g} out={out} />
                ))}
              </div>
              {/* Championship. */}
              <div className="flex flex-col justify-center">
                <GameBox g={champ} out={out} />
              </div>
            </div>
          </div>
        ))}
        <div className="mx-auto max-w-xs">
          <div className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-faint">Super Bowl</div>
          <GameBox g={sb} out={out} />
        </div>
      </div>
    </section>
  );
}
