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

/** Placeholder names that fit the narrow bracket. */
const SHORT_LABEL: Record<string, string> = { "Lowest seed left": "Low seed", "Wild Card winner": "WC winner", "Divisional winner": "Div. winner", "AFC champion": "AFC champ", "NFC champion": "NFC champ" };

// Conference colors: AFC red, NFC blue; the Super Bowl gold.
const COLOR = { AFC: "#d50a0a", NFC: "#1d4ed8", SB: "#b8860b" } as const;
type Tone = keyof typeof COLOR;

/** short: true, the abbreviation; "auto", the logo alone in a narrow bracket and the name when there's room. */
type Short = boolean | "auto";

function TeamLine({ side, out, tone, short = false, flip = false }: { side: Side; out: Set<string>; tone: Tone; short?: Short; flip?: boolean }) {
  if (!side.team) {
    return (
      <div className={`flex h-7 items-center px-2 text-[11px] italic text-faint ${flip ? "justify-end text-right" : ""}`}>
        <span className="truncate">{(short && side.label ? (SHORT_LABEL[side.label] ?? side.label) : side.label) ?? "TBD"}</span>
      </div>
    );
  }
  const t = side.team;
  const gone = side.lost || out.has(t.espnId);
  return (
    <div
      className={`flex h-7 min-w-0 items-center gap-1.5 px-2 text-xs ${flip ? "flex-row-reverse text-right" : ""} ${gone ? "text-muted" : "text-ink"}`}
      style={side.won ? { background: `color-mix(in srgb, ${COLOR[tone]} 14%, transparent)` } : undefined}
    >
      <span className="w-3 shrink-0 text-center text-[10px] font-bold tabular-nums" style={{ color: COLOR[tone] }}>
        {t.seed}
      </span>
      <TeamLogo src={t.logo} abbr={t.abbreviation} className="size-5 shrink-0" />
      <span className={`min-w-0 flex-1 truncate ${side.won ? "font-extrabold" : "font-semibold"} ${gone ? "line-through decoration-1 opacity-60" : ""}`}>
        {short === "auto" ? (
          // Narrow (phones): just the seed and logo; the name once there's room.
          <span className="hidden @[30rem]:inline">{t.name}</span>
        ) : short ? (
          (t.abbreviation ?? t.name)
        ) : (
          t.name
        )}
      </span>
      {side.score != null && <span className={`shrink-0 tabular-nums ${side.won ? "font-extrabold" : "text-muted"}`}>{side.score}</span>}
    </div>
  );
}

function GameBox({ g, out, tone, short, flip }: { g: Game; out: Set<string>; tone: Tone; short?: Short; flip?: boolean }) {
  const live = g.state === "in";
  return (
    <div
      className={`overflow-hidden rounded-md bg-bg shadow-sm ring-1 ${live ? "ring-2 ring-live" : "ring-line"} ${flip ? "border-r-[3px]" : "border-l-[3px]"}`}
      style={{ borderColor: COLOR[tone] }}
    >
      <TeamLine side={g.away} out={out} tone={tone} short={short} flip={flip} />
      <div className="h-px bg-line" />
      <TeamLine side={g.home} out={out} tone={tone} short={short} flip={flip} />
    </div>
  );
}

function ByeBox({ team, out, tone, short, flip }: { team: Seeded; out: Set<string>; tone: Tone; short?: Short; flip?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-md ring-1 ring-dashed ring-line ${flip ? "border-r-[3px]" : "border-l-[3px]"}`} style={{ borderColor: COLOR[tone] }}>
      <TeamLine side={{ team }} out={out} tone={tone} short={short} flip={flip} />
      <div className={`px-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-muted ${flip ? "text-right" : ""}`}>First-round bye</div>
    </div>
  );
}

function ConfTag({ c }: { c: "AFC" | "NFC" }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white" style={{ background: COLOR[c] }}>
      {c}
    </span>
  );
}

const ROUNDS = ["Wild Card", "Divisional", "Conference"];

export function PfBracket({ picture, games, out, projected }: { picture: Picture; games: PlayoffGame[]; out: Set<string>; projected: boolean }) {
  const confs = (["AFC", "NFC"] as const).map((c) => ({ c, ...conference(picture[c], games) }));
  const [afc, nfc] = confs;
  const sbReal = afc.champion && nfc.champion ? seededGame(games, 3, afc.champion, nfc.champion) : null;
  const sb: Game = sbReal ?? { away: afc.champion ? { team: afc.champion } : tbd("AFC champion"), home: nfc.champion ? { team: nfc.champion } : tbd("NFC champion"), state: "tbd" };
  const champ = sb.state === "post" ? winner(sb) : null;

  // One conference's three rounds as columns (the NFC's mirrored so both lead to the middle).
  const columns = (k: (typeof confs)[number], flip: boolean, short: Short) => {
    const cols = [
      <div key="wc" className="flex flex-col justify-around gap-2">
        <ByeBox team={k.bye} out={out} tone={k.c} short={short} flip={flip} />
        {k.wild.map((g, i) => (
          <GameBox key={i} g={g} out={out} tone={k.c} short={short} flip={flip} />
        ))}
      </div>,
      <div key="div" className="flex flex-col justify-around gap-2">
        {k.div.map((g, i) => (
          <GameBox key={i} g={g} out={out} tone={k.c} short={short} flip={flip} />
        ))}
      </div>,
      <div key="cc" className="flex flex-col justify-center">
        <GameBox g={k.champ} out={out} tone={k.c} short={short} flip={flip} />
      </div>,
    ];
    return flip ? cols.reverse() : cols;
  };
  const superBowl = (
    <div className="flex flex-col items-stretch justify-center gap-1.5">
      <div className="text-center text-[10px] font-extrabold uppercase tracking-wider" style={{ color: COLOR.SB }}>
        Super Bowl
      </div>
      <GameBox g={sb} out={out} tone="SB" short />
      {champ && (
        <div className="text-center text-[11px] font-bold" style={{ color: COLOR.SB }}>
          {champ.name} win it all
        </div>
      )}
    </div>
  );

  return (
    // Sized by the space it has, not the screen: the full mirrored bracket needs about 50rem;
    // narrower (a small laptop's middle column, a phone) it stacks the conferences.
    <section className="@container">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel fit className="!text-sm lg:!text-base">Playoff Bracket</SectionLabel>
        {projected && <span className="shrink-0 text-xs text-muted">If the season ended today</span>}
      </div>

      {/* Wide: the classic bracket, AFC on the left, NFC on the right, the Super Bowl in the
          middle; each round's games sit between the ones that feed them. */}
      <div className="mt-3 hidden @[50rem]:block">
        <div className="grid grid-cols-7 gap-2 pb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted">
          {[...ROUNDS, "", ...[...ROUNDS].reverse()].map((r, i) => (
            <div key={i} className="truncate">{r}</div>
          ))}
        </div>
        <div className="grid min-h-[26rem] grid-cols-7 gap-2 rounded-xl p-2" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${COLOR.AFC} 7%, transparent), transparent 40%, transparent 60%, color-mix(in srgb, ${COLOR.NFC} 7%, transparent))` }}>
          {columns(afc, false, true)}
          {superBowl}
          {columns(nfc, true, true)}
        </div>
        <div className="mt-1.5 flex justify-between px-1">
          <ConfTag c="AFC" />
          <ConfTag c="NFC" />
        </div>
      </div>

      {/* Narrower: one conference at a time, rounds left to right, then the Super Bowl. */}
      <div className="mt-3 space-y-5 @[50rem]:hidden">
        {confs.map((k) => (
          <div key={k.c} className="rounded-xl p-2" style={{ background: `color-mix(in srgb, ${COLOR[k.c]} 6%, transparent)` }}>
            <div className="mb-1.5 flex items-center gap-2">
              <ConfTag c={k.c} />
            </div>
            <div className="grid grid-cols-3 gap-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
              {ROUNDS.map((r) => (
                <div key={r} className="truncate">{r}</div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">{columns(k, false, "auto")}</div>
          </div>
        ))}
        <div className="mx-auto w-full max-w-xs">{superBowl}</div>
      </div>
    </section>
  );
}
