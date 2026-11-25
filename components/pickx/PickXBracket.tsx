"use client";

import { useState } from "react";
import { FitText } from "@/components/FitText";
import { TeamLogo, chipClass } from "@/components/ui";
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
        <FitText min={9} className="min-w-0 flex-1">{placeholder ?? "TBD"}</FitText>
      </div>
    );
  const isMine = !!t.id && mine.has(t.id);
  return (
    <div data-line className={`flex h-6 items-center gap-1.5 px-1.5 text-[12px] ${t.lost ? "text-muted" : ""} ${isMine ? "bg-accent/10" : ""}`}>
      <span className="w-4 shrink-0 text-right text-[10px] font-bold tabular-nums text-muted">{t.seed ?? ""}</span>
      <TeamLogo src={t.logo} abbr={t.abbr} className="size-4 shrink-0 dark:rounded-full dark:bg-white/90 dark:p-px" />
      <FitText min={9} className={`min-w-0 flex-1 ${t.won ? "font-bold" : "font-medium"} ${isMine ? "text-accent" : ""} ${t.lost ? "line-through decoration-1" : ""}`}>{t.name}</FitText>
      <span className={`shrink-0 tabular-nums ${t.won ? "font-bold" : ""}`}>{t.score ?? ""}</span>
    </div>
  );
}

function Game({ g, mine, color, className = "" }: { g: LiveGame; mine: Set<string>; /** The region's color, down the game's left edge. */ color?: string; className?: string }) {
  const live = g.status === "in_progress";
  return (
    <div className={`w-full min-w-0 ${className}`}>
      <div data-detail className={`flex h-4 items-center gap-1 px-1 text-[9.5px] leading-none ${live ? "font-semibold text-live" : "text-muted"}`}>
        {live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-live" aria-hidden />}
        {/* A plain "Final" adds nothing (the winner is in bold); "Final/OT" and clocks and tip times show. */}
        <FitText min={7} className="min-w-0 flex-1">{g.status === "final" && /^final$/i.test(g.detail ?? "") ? "" : (g.detail ?? "")}</FitText>
      </div>
      <div className={`overflow-hidden rounded-md border bg-bg ${live ? "border-live" : "border-line"}`} style={color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}>
        <TeamLine t={g.teams[0]} placeholder={g.placeholders[0]} mine={mine} />
        <div className="border-t border-line" />
        <TeamLine t={g.teams[1]} placeholder={g.placeholders[1]} mine={mine} />
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
        <div className={`mb-1.5 flex ${flip ? "justify-end" : ""}`}>
          <span className="rounded-md px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase" style={{ backgroundColor: color }}>{b.regions[r]}</span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        {ordered.map(({ i, games }) => (
          <div key={i} className="flex min-w-0 flex-col justify-around gap-1">
            {games.map((g) => (
              <Game key={g.key} g={g} mine={mine} color={color} />
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
function FinalFour({ b, mine, row = false }: { b: LiveBracket; mine: Set<string>; row?: boolean }) {
  const [semi1, semi2] = b.rounds[4];
  const title = b.rounds[5][0];
  return (
    <div className={row ? "grid grid-cols-3 items-center gap-3" : "flex flex-col justify-center gap-6"}>
      <div>
        <div className="mb-1 text-center text-[11px] font-bold tracking-wide text-[#b8860b] uppercase dark:text-[#e0b84c]">Final Four · {b.regions[0]}/{b.regions[1]}</div>
        <Game g={semi1} mine={mine} color={GOLD} />
      </div>
      <div className="rounded-lg border-2 border-[#b8860b]/60 bg-[#b8860b]/5 p-1.5">
        <div className="mb-1 text-center text-[11px] font-bold tracking-wide text-[#b8860b] uppercase dark:text-[#e0b84c]">🏆 Championship</div>
        <Game g={title} mine={mine} color={GOLD} />
      </div>
      <div>
        <div className="mb-1 text-center text-[11px] font-bold tracking-wide text-[#b8860b] uppercase dark:text-[#e0b84c]">Final Four · {b.regions[2]}/{b.regions[3]}</div>
        <Game g={semi2} mine={mine} color={GOLD} />
      </div>
    </div>
  );
}

function FirstFour({ b, mine }: { b: LiveBracket; mine: Set<string> }) {
  if (!b.firstFour.length) return <p className="text-sm text-muted">{b.fromEspn ? "No First Four games." : "The First Four games show here when ESPN's scoreboard can be read."}</p>;
  return (
    <div className="grid gap-x-3 gap-y-2 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]">
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

/** The whole bracket: the First Four on top, the left half's regions, the Final Four, the right half's. */
function FullBracket({ b, mine }: { b: LiveBracket; mine: Set<string> }) {
  return (
    <>
      {b.firstFour.length > 0 && (
        <section className="mb-5">
          <div className="mb-1 text-xs font-bold tracking-wide text-muted uppercase">First Four</div>
          <FirstFour b={b} mine={mine} />
        </section>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_26rem_minmax(0,1fr)] gap-4">
        <div className="space-y-6">
          <Region b={b} r={0} mine={mine} />
          <Region b={b} r={1} mine={mine} />
        </div>
        <FinalFour b={b} mine={mine} row />
        <div className="space-y-6">
          <Region b={b} r={2} mine={mine} flip />
          <Region b={b} r={3} mine={mine} flip />
        </div>
      </div>
    </>
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
export function PrintableBracket({ b, mine }: { b: LiveBracket; mine: string[] }) {
  return <FullBracket b={b} mine={new Set(mine)} />;
}
