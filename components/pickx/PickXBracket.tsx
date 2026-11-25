"use client";

import { useState } from "react";
import { FitText } from "@/components/FitText";
import { chipClass } from "@/components/ui";
import type { LiveBracket, LiveGame, LiveTeam } from "@/lib/tourneyLive";

// The live NCAA Tournament bracket for a Pick X pool. Wide screens: the whole bracket, the left
// half's regions (which meet in one semifinal) running right, the right half's running left,
// the Final Four in the middle and the First Four above. Narrower: one region (or the First
// Four, or the Final Four) at a time, its rounds side by side. Your teams are in blue.

const ROUND_SHORT = ["R64", "R32", "Sweet 16", "Elite 8", "Final Four", "Title"];
/** A color for each region (by its place in the bracket), and gold for the Final Four. */
const REGION_COLORS = ["#1d4ed8", "#c2410c", "#047857", "#7c3aed"];
const GOLD = "#b8860b";

function TeamLine({ t, placeholder, mine }: { t: LiveTeam | null; placeholder: string | null; mine: Set<string> }) {
  if (!t)
    return (
      <div data-line className="flex h-6 items-center gap-1.5 px-1.5 text-[12px] text-faint">
        <span className="w-4 shrink-0" />
        {/* On paper the line stays blank, to write a team in. */}
        <span data-tbd className="min-w-0 flex-1">
          <FitText min={9}>{placeholder ?? "TBD"}</FitText>
        </span>
      </div>
    );
  const isMine = !!t.id && mine.has(t.id);
  return (
    <div data-line className={`flex h-6 items-center gap-1.5 px-1.5 text-[12px] ${t.lost ? "text-muted" : ""} ${isMine ? "bg-accent/10" : ""}`}>
      <span className="w-4 shrink-0 text-right text-[10px] font-bold tabular-nums text-muted">{t.seed ?? ""}</span>
      <FitText min={9} className={`min-w-0 flex-1 ${t.won ? "font-bold" : "font-medium"} ${isMine ? "text-accent" : ""} ${t.lost ? "line-through decoration-1" : ""}`}>{t.name}</FitText>
      <span className={`shrink-0 tabular-nums ${t.won ? "font-bold" : ""}`}>{t.score ?? ""}</span>
    </div>
  );
}

/** The lines joining games: a little darker than the hairlines, so they print. */
const WIRE = "border-[color-mix(in_srgb,var(--ink)_35%,transparent)]";

function Game({ g, mine, color, out, className = "" }: {
  g: LiveGame;
  mine: Set<string>;
  /** The region's color, down the game's left edge. */
  color?: string;
  /** A line from the middle of the game out to one side (into the gap), toward the next game. */
  out?: "left" | "right";
  className?: string;
}) {
  const live = g.status === "in_progress";
  return (
    <div className={`w-full min-w-0 ${className}`}>
      <div data-detail className={`flex h-4 items-center gap-1 px-1 text-[9.5px] leading-none print:hidden ${live ? "font-semibold text-live" : "text-muted"}`}>
        {live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-live" aria-hidden />}
        {/* A plain "Final" adds nothing (the winner is in bold); "Final/OT" and clocks and tip times show. */}
        <FitText min={7} className="min-w-0 flex-1">{g.status === "final" && /^final$/i.test(g.detail ?? "") ? "" : (g.detail ?? "")}</FitText>
      </div>
      <div className="relative">
        <div className={`overflow-hidden rounded-md border bg-bg ${live ? "border-live" : "border-line"}`} style={color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}>
          <TeamLine t={g.teams[0]} placeholder={g.placeholders[0]} mine={mine} />
          <div className="border-t border-line" />
          <TeamLine t={g.teams[1]} placeholder={g.placeholders[1]} mine={mine} />
        </div>
        {out && <span aria-hidden className={`absolute top-1/2 w-4 border-t ${WIRE} ${out === "right" ? "left-full" : "right-full"}`} />}
      </div>
      {/* On paper, under the game: its day and city (the clock and tip time line above is for the screen). */}
      <div data-meta className="hidden h-3 items-center px-1 text-[9px] leading-none font-semibold whitespace-nowrap text-muted print:flex">
        {[g.date, g.site?.split(",")[0]].filter(Boolean).join(" · ")}
      </div>
    </div>
  );
}

/** One region's four rounds side by side (mirrored for the right half), each round's games spread evenly down the column. */
function Region({ b, r, mine, flip = false, label = true }: { b: LiveBracket; r: number; mine: Set<string>; flip?: boolean; label?: boolean }) {
  const cols = [0, 1, 2, 3].map((i) => {
    const per = 8 >> i;
    return { i, games: b.rounds[i].slice(r * per, (r + 1) * per) };
  });
  const ordered = flip ? [...cols].reverse() : cols;
  const color = REGION_COLORS[r];
  return (
    <div className="min-w-0">
      {label && (
        <div className={`mb-1.5 flex h-6 items-center ${flip ? "justify-end" : ""}`}>
          <span className="rounded-md px-2 py-0.5 text-xs font-extrabold tracking-wider text-white uppercase" style={{ backgroundColor: color }}>{b.regions[r]}</span>
          {b.regionSites[r] && <span className={`text-[10px] font-semibold tracking-wide text-muted uppercase ${flip ? "order-first mr-2" : "ml-2"}`}>{b.regionSites[r]}</span>}
        </div>
      )}
      {/* Each round's games in pairs; a bracket line joins each pair to the game its winner plays next. */}
      <div className="grid grid-cols-4 gap-x-4">
        {ordered.map(({ i, games }) => (
          <div key={i} className="flex min-w-0 flex-col justify-around">
            {i === 3
              ? games.map((g) => <Game key={g.key} g={g} mine={mine} color={color} />)
              : Array.from({ length: games.length / 2 }, (_, k) => (
                  <div key={k} className="relative flex flex-1 flex-col justify-around gap-1 py-0.5">
                    <Game g={games[2 * k]} mine={mine} color={color} />
                    <Game g={games[2 * k + 1]} mine={mine} color={color} />
                    {/* From the middle of each game of the pair, into the gap, and down/up to the pair's middle… */}
                    <span
                      aria-hidden
                      className={`absolute w-2 border-y ${WIRE} ${flip ? "right-full border-l" : "left-full border-r"}`}
                      style={{ top: "calc(25% + var(--g-off, 8px))", bottom: "calc(25% - var(--g-off, 8px))" }}
                    />
                    {/* …then across to the next game. */}
                    <span aria-hidden className={`absolute w-2 border-t ${WIRE} ${flip ? "right-[calc(100%+0.5rem)]" : "left-[calc(100%+0.5rem)]"}`} style={{ top: "calc(50% + var(--g-off, 8px))" }} />
                  </div>
                ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Final Four and the title game. In the full bracket (`row`), each semifinal sits on its own
 * half's side (the left half's beside its regions, the right half's beside its) with the title
 * game between them; on its own (narrower screens), stacked.
 */
function FinalFour({ b, mine, row = false, writeIn = false }: {
  b: LiveBracket;
  mine: Set<string>;
  row?: boolean;
  /** The printout: lines under the title game to write in a champion and a tiebreaker. */
  writeIn?: boolean;
}) {
  const [semi1, semi2] = b.rounds[4];
  const title = b.rounds[5][0];
  const label = "mb-1 flex h-7 items-end justify-center text-center text-[11px] leading-tight font-bold tracking-wide text-[#b8860b] uppercase dark:text-[#e0b84c]";
  if (!row) {
    return (
      <div className="flex flex-col justify-center gap-6">
        <div>
          <div className={label}>Final Four · {b.regions[0]}/{b.regions[1]}</div>
          <Game g={semi1} mine={mine} color={GOLD} />
        </div>
        <div className="rounded-lg border-2 border-[#b8860b]/60 bg-[#b8860b]/5 p-1.5">
          <div className={label}>🏆 Championship</div>
          <Game g={title} mine={mine} color={GOLD} />
        </div>
        <div>
          <div className={label}>Final Four · {b.regions[2]}/{b.regions[3]}</div>
          <Game g={semi2} mine={mine} color={GOLD} />
        </div>
      </div>
    );
  }
  // In the full bracket: the semifinals on their halves' sides, the title game between them,
  // all on one line so the bracket lines meet.
  return (
    <div className="grid grid-cols-3 items-start gap-x-4">
      <div>
        <div className={label}>Final Four<br />{b.roundDates[4]}</div>
        <Game g={semi1} mine={mine} color={GOLD} out="right" />
      </div>
      <div className="relative">
        <div className={label}>🏆 Championship<br />{b.roundDates[5]}</div>
        <Game g={title} mine={mine} color={GOLD} className="rounded-md ring-2 ring-[#b8860b]/50 ring-offset-2" />
        {writeIn && (
          // Out of the flow, below the Final Four, so the title game stays level with the semifinals.
          <div className="absolute inset-x-[-5.5rem] top-full mt-6 rounded-xl border-2 border-[#b8860b] bg-[#fdf8ec] px-4 pt-2 pb-4 text-[12px] font-semibold">
            <div className="text-center text-[28px] leading-none">🏆</div>
            <div className="mt-1 text-center text-[13px] font-extrabold tracking-[0.12em] whitespace-nowrap text-[#0b2a5b] uppercase">National Champion</div>
            {b.finalSite && <div className="text-center text-[10px] font-bold tracking-widest text-[#b8860b] uppercase">{b.roundDates[5]} · {b.finalSite}</div>}
            <div className="mt-4 space-y-4">
              <div className="flex items-end gap-1.5"><span className="shrink-0">Champion:</span><span className="flex-1 border-b-2 border-[#0a0a0a]" /></div>
              <div className="flex items-end gap-1.5"><span className="shrink-0">Total Points in Championship Game:</span><span className="flex-1 border-b-2 border-[#0a0a0a]" /></div>
              <div className="flex items-end gap-1.5"><span className="shrink-0">Name:</span><span className="flex-1 border-b-2 border-[#0a0a0a]" /></div>
            </div>
          </div>
        )}
      </div>
      <div>
        <div className={label}>Final Four<br />{b.roundDates[4]}</div>
        <Game g={semi2} mine={mine} color={GOLD} out="left" />
      </div>
    </div>
  );
}

function FirstFour({ b, mine, row = false }: { b: LiveBracket; mine: Set<string>; /** All four side by side. */ row?: boolean }) {
  if (!b.firstFour.length) return <p className="text-sm text-muted">{b.fromEspn ? "No First Four games." : "The First Four games show here when ESPN's scoreboard can be read."}</p>;
  return (
    <div className={row ? "grid flex-1 grid-cols-4 gap-x-4" : "grid grid-cols-2 gap-x-3 gap-y-2"}>
      {b.firstFour.map((g) => (
        <div key={g.key} className="min-w-0">
          <div className="px-1 text-[10px] font-semibold" style={{ color: REGION_COLORS[b.regions.indexOf(g.region ?? "")] ?? undefined }}>{[g.region, g.seed ? `${g.seed} seed` : null].filter(Boolean).join(" · ")}</div>
          <Game g={g} mine={mine} color={REGION_COLORS[b.regions.indexOf(g.region ?? "")]} />
        </div>
      ))}
    </div>
  );
}

type View = "ff" | "r0" | "r1" | "r2" | "r3" | "final";

/** The round names and their days over a half's four columns (44px tall). */
function Rounds({ b, flip = false }: { b: LiveBracket; flip?: boolean }) {
  const names = ["First Round", "Second Round", "Sweet 16", "Elite 8"];
  const cols = flip ? [3, 2, 1, 0] : [0, 1, 2, 3];
  return (
    <div className="mb-2 grid h-9 grid-cols-4 gap-x-4">
      {cols.map((i) => (
        <div key={i} className="flex flex-col items-center justify-center rounded-md bg-[#0b2a5b] text-center leading-tight text-white">
          <span className="text-[10px] font-extrabold tracking-widest uppercase">{names[i]}</span>
          <span className="text-[10px] text-white/75">{b.roundDates[i]}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The whole bracket: the left half's regions, the Final Four, the right half's, with the First
 * Four under the Final Four. Bracket lines join every game to the next, including each half's
 * Elite 8 games to its semifinal.
 */
function FullBracket({ b, mine, writeIn = false }: { b: LiveBracket; mine: Set<string>; writeIn?: boolean }) {
  // The line from a half's two Elite 8 games to its semifinal. A region is its 30px label and its
  // games (the Elite 8 game centered); the two regions sit 24px apart, so their Elite 8 games are
  // at 25% + 9px and 75% + 21px of the half (plus the games' clock line, --g-off), meeting at 50% + 15px.
  const join = (side: "left" | "right") => (
    <>
      <span
        aria-hidden
        className={`absolute w-2 border-y ${WIRE} ${side === "left" ? "left-full border-r" : "right-full border-l"}`}
        style={{ top: "calc(25% + 9px + var(--g-off, 8px))", bottom: "calc(25% - 21px - var(--g-off, 8px))" }}
      />
      <span aria-hidden className={`absolute w-2 border-t ${WIRE} ${side === "left" ? "left-[calc(100%+0.5rem)]" : "right-[calc(100%+0.5rem)]"}`} style={{ top: "calc(50% + 15px + var(--g-off, 8px))" }} />
    </>
  );
  return (
    <div className="relative grid grid-cols-[minmax(0,1fr)_26rem_minmax(0,1fr)] gap-x-4">
      {/* The First Four, all four games across the top: under the round headers, in the open space
          between the two Second Round columns (above each half's first Sweet 16 game). */}
      {b.firstFour.length > 0 && (
        <section className="absolute top-[48px] z-10 flex items-center gap-x-3" style={{ left: "calc((100% - 28rem) / 4 + 1rem)", right: "calc((100% - 28rem) / 4 + 1rem)" }}>
          <div className="shrink-0 text-center text-xs leading-tight font-extrabold tracking-widest text-muted uppercase">First<br />Four</div>
          <FirstFour b={b} mine={mine} row />
        </section>
      )}
      <div>
        <Rounds b={b} />
        <div className="relative space-y-6">
          <Region b={b} r={0} mine={mine} />
          <Region b={b} r={1} mine={mine} />
          {join("left")}
        </div>
      </div>
      {/* Padded so the semifinals sit level with the lines from each half's Elite 8 games. */}
      <div className="relative flex flex-col justify-center pt-[20px]">
        <FinalFour b={b} mine={mine} row writeIn={writeIn} />
      </div>
      <div>
        <Rounds b={b} flip />
        <div className="relative space-y-6">
          <Region b={b} r={2} mine={mine} flip />
          <Region b={b} r={3} mine={mine} flip />
          {join("right")}
        </div>
      </div>
    </div>
  );
}

export function PickXBracket({ b, mine: mineIds, printHref }: { b: LiveBracket; mine: string[]; /** The printable page (opens in a new tab). */ printHref: string }) {
  const mine = new Set(mineIds);
  // Narrow screens open on the region with a game being played, else the First Four before the
  // First Round, else the East.
  const liveRegion = [0, 1, 2, 3].find((r) => [0, 1, 2, 3].some((i) => b.rounds[i].slice(r * (8 >> i), (r + 1) * (8 >> i)).some((g) => g.status === "in_progress")));
  const firstRoundStarted = b.rounds[0].some((g) => g.status !== "scheduled");
  const titleTime = b.rounds[3].every((g) => g.status === "final");
  const [view, setView] = useState<View>(liveRegion !== undefined ? (`r${liveRegion}` as View) : titleTime ? "final" : !firstRoundStarted && b.firstFour.length ? "ff" : "r0");
  const views: [View, string][] = [...(b.firstFour.length ? [["ff", "First Four"] as [View, string]] : []), ...b.regions.map((name, r) => [`r${r}`, name] as [View, string]), ["final", "Final Four"]];

  return (
    <div className="@container">
      {/* Print (or save as PDF) the whole bracket, on one landscape page with the site's name and logo. */}
      <div className="mb-3 flex justify-end print:hidden">
        <a href={printHref} target="_blank" rel="noopener" className={chipClass(false, "cursor-pointer", "sm")}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4" aria-hidden>
            <path d="M5.5 7V3h9v4M5.5 14.5h-2v-6a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5v6h-2" strokeLinejoin="round" />
            <path d="M5.5 11.5h9V17h-9z" strokeLinejoin="round" />
          </svg>
          Print / Save PDF
        </a>
      </div>

      {/* Wide: the whole bracket. */}
      <div className="hidden @[92rem]:block">
        <FullBracket b={b} mine={mine} />
      </div>

      {/* Narrower: one part at a time. */}
      <div className="@[92rem]:hidden">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {views.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={chipClass(view === id, "cursor-pointer whitespace-nowrap", "sm")}>
              {label}
            </button>
          ))}
        </div>
        {view === "ff" ? (
          <FirstFour b={b} mine={mine} />
        ) : view === "final" ? (
          <div className="mx-auto max-w-xs">
            <FinalFour b={b} mine={mine} />
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="min-w-[44rem]">
              <div className="mb-1 grid grid-cols-4 gap-1.5 text-[10px] font-bold tracking-wide text-muted uppercase">
                {ROUND_SHORT.slice(0, 4).map((r) => (
                  <span key={r}>{r}</span>
                ))}
              </div>
              <Region b={b} r={Number(view.slice(1))} mine={mine} label={false} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The whole bracket for the printable page (/print/bracket/[slug]). */
export function PrintableBracket({ b }: { b: LiveBracket }) {
  // The same for everyone: nobody's picks are marked on the printout.
  return <FullBracket b={b} mine={new Set()} writeIn />;
}
