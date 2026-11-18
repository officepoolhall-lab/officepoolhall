"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlayerProfile, TeamHistory } from "@/lib/espnProfiles";
import { useScrollLock } from "@/lib/useScrollLock";
import { CheckIcon, TeamLogo } from "./ui";
import { FitText } from "./FitText";

type Sport = "ncaaf" | "ncaab" | "nfl";

/** Fetch once per open; "failed" shows a short note instead of the content. */
function useJson<T>(url: string) {
  const [state, setState] = useState<T | "loading" | "failed">("loading");
  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setState(d as T))
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
  }, [url]);
  return state;
}

/** The pop-up shell shared with the golf pop-ups: blue outline, page behind locked, tap outside to close. */
/** Pop-up widths: wide enough for a game log's stat columns on a laptop, never past the screen. */
const WIDTHS = { normal: "w-[min(30rem,calc(100vw-2rem))]", wide: "w-[min(44rem,calc(100vw-2rem))]", log: "w-[min(64rem,calc(100vw-2rem))]" };

function Shell({ label, onClose, header, children, size = "normal" }: { label: string; onClose: () => void; header: ReactNode; children: ReactNode; size?: keyof typeof WIDTHS }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useScrollLock();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      // Only this dialog's own close: React passes a nested pop-up's close up to its parents.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className={`m-auto ${WIDTHS[size]} rounded-xl border-2 border-accent bg-bg p-0 text-ink shadow-xl backdrop:bg-black/50`}
      aria-label={label}
    >
      <div className="max-h-[min(85vh,calc(100dvh-2rem))] overflow-y-auto overscroll-contain p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">{header}</div>
          <button type="button" onClick={() => dialog.current?.close()} className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-surface" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="mt-4 text-sm text-muted">{children}</p>;

// ---------------------------------------------------------------------------------------------
// Player: from the box score
// ---------------------------------------------------------------------------------------------

/** A player's name in the box score: tap for their game log and season totals. */
export function PlayerName({ sport, id, name, className = "" }: { sport: Sport; id: string | null; name: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!id) return <span className={className}>{name}</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`-mx-1 rounded px-1 text-left transition hover:bg-hover ${className}`}>
        {name}
      </button>
      {open && <PlayerDialog sport={sport} id={id} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

function PlayerDialog({ sport, id, name, onClose }: { sport: Sport; id: string; name: string; onClose: () => void }) {
  const data = useJson<PlayerProfile>(`/api/espn/player?sport=${sport}&id=${id}`);
  const p = typeof data === "object" ? data : null;
  return (
    <Shell
      label={`${p?.name ?? name}: game log`}
      onClose={onClose}
      size="log"
      header={
        <div className="flex items-center gap-3">
          {p?.headshot && (
            // eslint-disable-next-line @next/next/no-img-element -- ESPN's headshot, any size
            <img src={p.headshot} alt="" className="size-14 shrink-0 rounded-full bg-surface object-cover" />
          )}
          <div className="min-w-0">
            {/* The team's logo beside the name; team, position, number and (college) year on one line. */}
            <div className="flex min-w-0 items-center gap-2">
              {p?.teamLogo && <TeamLogo src={p.teamLogo} abbr={null} className="size-6" />}
              {/* The whole name: a long one's text shrinks to fit rather than being cut off. */}
              <h2 className="min-w-0 flex-1 text-lg font-bold">
                <FitText min={12}>{p?.name ?? name}</FitText>
              </h2>
            </div>
            <p className="truncate whitespace-nowrap text-xs text-muted">
              {[p?.team, p?.position, p?.jersey ? `#${p.jersey}` : null, p?.year].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      }
    >
      {data === "loading" ? (
        <Note>Loading…</Note>
      ) : data === "failed" || !p ? (
        <Note>ESPN doesn&apos;t have a game log for this player right now.</Note>
      ) : !p.tables.length ? (
        <Note>No games this season yet.</Note>
      ) : (
        p.tables.map((t) => (
          <div key={t.name} className="mt-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t.name}</h3>
            {/* Wide stat lines scroll inside the pop-up; the game column stays put. */}
            <div className="overflow-x-auto">
              {/* One line per game: nothing wraps; the table is as wide as its columns need. */}
              <table className="w-full min-w-max border-separate border-spacing-0 whitespace-nowrap text-xs tabular-nums">
                <thead>
                  <tr className="text-muted">
                    <th className="sticky left-0 bg-bg py-1.5 pr-3 text-left font-medium">Game</th>
                    {t.labels.map((l, i) => (
                      <th key={i} className="whitespace-nowrap px-1.5 py-1.5 text-right font-medium">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.averages && (
                    <tr className="font-semibold">
                      <td className="sticky left-0 border-t border-line bg-bg py-1.5 pr-3">Per game</td>
                      {t.averages.map((v, i) => (
                        <td key={i} className="border-t border-line px-1.5 py-1.5 text-right">{v}</td>
                      ))}
                    </tr>
                  )}
                  {t.totals && (
                    <tr className={t.averages ? "text-muted" : "font-semibold"}>
                      <td className="sticky left-0 border-y border-line bg-bg py-1.5 pr-3">{t.averages ? "Totals" : "Season"}</td>
                      {t.totals.map((v, i) => (
                        <td key={i} className="border-y border-line px-1.5 py-1.5 text-right">{v}</td>
                      ))}
                    </tr>
                  )}
                  {t.games.map((g) => (
                    <tr key={g.id}>
                      <td className="sticky left-0 border-b border-line bg-bg py-1.5 pr-3">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="w-10 text-muted">{g.date ? formatInTimeZone(g.date, "America/New_York", "M/d") : ""}</span>
                          <span className="text-muted">{g.atVs}</span>
                          <TeamLogo src={g.opponentLogo} abbr={g.opponent} className="size-4" />
                          <span className="font-medium">{g.opponent}</span>
                          {g.result && <span className={`font-semibold ${g.result === "W" ? "text-win" : g.result === "L" ? "text-loss" : "text-muted"}`}>{g.result}</span>}
                        </span>
                      </td>
                      {g.stats.map((v, i) => (
                        <td key={i} className="border-b border-line px-1.5 py-1.5 text-right">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------
// Team: from My Picks
// ---------------------------------------------------------------------------------------------

/** A team's recent results and, in ATS pools, its record against the spread. */
export function TeamHistoryDialog({
  sport,
  espnId,
  name,
  logo,
  ats,
  timezone,
  onClose,
}: {
  sport: Sport;
  espnId: string;
  name: string;
  logo: string | null;
  ats: boolean;
  timezone: string;
  onClose: () => void;
}) {
  const data = useJson<TeamHistory>(`/api/espn/team?sport=${sport}&id=${espnId}${ats ? "&ats=1" : ""}`);
  const t = typeof data === "object" ? data : null;
  const overall = t?.ats.find((s) => s.name === "atsOverall") ?? t?.ats[0];
  return (
    <Shell
      label={`${name}: recent games`}
      onClose={onClose}
      size={ats ? "wide" : "normal"}
      header={
        <div className="flex items-center gap-3">
          <TeamLogo src={t?.logo ?? logo} abbr={null} className="size-10" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{t?.name ?? name}</h2>
            <p className="text-xs text-muted tabular-nums">
              {t?.record ? `${t.record.replace(/-/g, "–")} Overall` : ""}
              {ats && overall ? `${t?.record ? " · " : ""}${overall.wins}–${overall.losses}${overall.pushes ? `–${overall.pushes}` : ""} ATS` : ""}
            </p>
          </div>
        </div>
      }
    >
      {data === "loading" ? (
        <Note>Loading…</Note>
      ) : data === "failed" || !t ? (
        <Note>ESPN doesn&apos;t have this team&apos;s results right now.</Note>
      ) : (
        <>
          {ats && t.ats.length > 0 && (
            <section className="mt-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Against The Spread</h3>
              <ul className="grid grid-cols-2 gap-x-6 border-t border-line text-sm">
                {t.ats.map((s) => (
                  <li key={s.name} className="flex justify-between border-b border-line py-1.5">
                    <span className="text-muted">{s.label}</span>
                    <span className="font-semibold tabular-nums">
                      {s.wins}–{s.losses}
                      {s.pushes ? `–${s.pushes}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {ats && !t.ats.length && <Note>No lines found for this team&apos;s games yet.</Note>}
          <section className="mt-4">
            {/* The heading, with the Line and Cover column labels on its line in ATS pools. */}
            <div className="mb-1 flex items-end gap-2 text-muted">
              <h3 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide">Recent Games</h3>
              {ats && t.recent.length > 0 && (
                <>
                  <span className="w-12 shrink-0 text-right text-[11px] font-medium" aria-hidden>Line</span>
                  <span className="w-10 shrink-0 text-right text-[11px] font-medium" aria-hidden>Cover</span>
                </>
              )}
            </div>
            {t.recent.length ? (
              <ul className="border-t border-line text-sm">
                {t.recent.slice(0, ats ? 15 : 10).map((g) => (
                  <li key={g.id} className="flex items-center gap-2 border-b border-line py-1.5">
                    <span className="w-11 shrink-0 text-xs tabular-nums text-muted">{g.date ? formatInTimeZone(g.date, timezone, "M/d") : ""}</span>
                    <span className="w-5 shrink-0 text-xs text-muted">{g.atVs}</span>
                    {/* Phones: the opponent's logo alone (names got cut off). Wider screens: the logo
                        and the opponent's name, which fits there. */}
                    <TeamLogo src={g.opponentLogo} abbr={g.opponent} className="size-6 sm:size-5" />
                    <span className="min-w-0 flex-1 truncate font-medium max-sm:sr-only">{g.opponentName ?? g.opponent}</span>
                    <span className="min-w-0 flex-1 sm:hidden" />
                    <span className={`w-4 shrink-0 font-semibold ${g.result === "W" ? "text-win" : g.result === "L" ? "text-loss" : "text-muted"}`}>{g.result ?? ""}</span>
                    <span className="w-14 shrink-0 text-right tabular-nums">{g.score ?? ""}</span>
                    {/* ATS pools: the team's line that game and whether it covered. */}
                    {ats && (
                      <>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{g.spread === null ? "—" : g.spread === 0 ? "PK" : g.spread > 0 ? `+${g.spread}` : g.spread}</span>
                        {/* Covered: a green check. Didn't: a red X. A push says so. */}
                        <span className="flex w-10 shrink-0 justify-end text-xs font-semibold text-muted">
                          {g.ats === "W" ? (
                            <CheckIcon className="size-5 text-win" />
                          ) : g.ats === "L" ? (
                            <XIcon className="size-5 text-loss" />
                          ) : g.ats === "P" ? (
                            "Push"
                          ) : null}
                          <span className="sr-only">{g.ats === "W" ? "Covered" : g.ats === "L" ? "Did Not Cover" : ""}</span>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Note>No games played yet this season.</Note>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}

function XIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden className={className}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </svg>
  );
}
