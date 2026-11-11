"use client";

import { useEffect, useRef, useState } from "react";
import type { LeaderRow } from "./GolfLeaderboard";

type Hole = { hole: number; par: number | null; strokes: number | null };
type Round = { round: number; strokes: number | null; toPar: string | null; holes: Hole[] };

/** The usual scorecard marks: circles under par, squares over (two for eagle or double bogey). */
function Mark({ strokes, par }: { strokes: number | null; par: number | null }) {
  if (strokes === null) return <span className="text-faint">–</span>;
  if (par === null) return <span>{strokes}</span>;
  const d = strokes - par;
  const shape =
    d <= -2
      ? "rounded-full outline outline-1 outline-offset-2 outline-loss border border-loss text-loss"
      : d === -1
        ? "rounded-full border border-loss text-loss"
        : d === 1
          ? "border border-ink"
          : d >= 2
            ? "border border-ink outline outline-1 outline-offset-2 outline-ink"
            : "";
  const label = d <= -2 ? "eagle or better" : d === -1 ? "birdie" : d === 0 ? "par" : d === 1 ? "bogey" : "double bogey or worse";
  return (
    <span className={`inline-grid size-5 place-items-center text-[12px] tabular-nums ${shape}`}>
      {strokes}
      <span className="sr-only"> ({label})</span>
    </span>
  );
}

function Nine({ holes, label }: { holes: Hole[]; label: string }) {
  if (!holes.length) return null;
  const sum = (k: "par" | "strokes") => (holes.every((h) => h[k] !== null) ? holes.reduce((s, h) => s + (h[k] ?? 0), 0) : null);
  const cell = "min-w-7 px-0.5 py-1 text-center";
  return (
    <table className="w-full table-fixed border-collapse text-xs">
      <tbody>
        <tr className="text-muted">
          <th className={`${cell} w-12 text-left font-medium`}>Hole</th>
          {holes.map((h) => (
            <td key={h.hole} className={cell}>{h.hole}</td>
          ))}
          <td className={`${cell} w-10 font-semibold`}>{label}</td>
        </tr>
        {holes.some((h) => h.par !== null) && (
          <tr className="text-muted">
            <th className={`${cell} text-left font-medium`}>Par</th>
            {holes.map((h) => (
              <td key={h.hole} className={cell}>{h.par ?? ""}</td>
            ))}
            <td className={`${cell} font-semibold`}>{sum("par") ?? ""}</td>
          </tr>
        )}
        <tr className="border-t border-line">
          <th className={`${cell} text-left font-medium text-muted`}>Score</th>
          {holes.map((h) => (
            <td key={h.hole} className={cell}>
              <Mark strokes={h.strokes} par={h.par} />
            </td>
          ))}
          <td className={`${cell} font-bold tabular-nums`}>{sum("strokes") ?? ""}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * A golfer's scorecard: one tab per round played, each split into the front and back nine with
 * the par and score for every hole. Loads from /api/golf/scorecard when opened.
 */
export function GolfScorecard({
  tournamentId,
  eventName,
  golfer,
  live,
  onClose,
}: {
  tournamentId: string;
  eventName: string;
  golfer: LeaderRow;
  /** While the tournament is under way, the card reloads every minute as holes are finished. */
  live: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rounds, setRounds] = useState<Round[] | null | "error">(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let stale = false;
    let first = true;
    const load = () =>
      fetch(`/api/golf/scorecard?event=${tournamentId}&golfer=${golfer.id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((b: { card: { rounds: Round[] } | null }) => {
          if (stale) return;
          const list = b.card?.rounds ?? [];
          setRounds(list);
          // Open on the latest round with scores; later reloads keep the round being viewed.
          if (first) setTab(Math.max(0, list.findLastIndex((r) => r.holes.some((h) => h.strokes !== null))));
          first = false;
        })
        .catch(() => {
          // A failed reload keeps what's showing; only the first load reports an error.
          if (!stale && first) setRounds("error");
        });
    load();
    const id = live ? setInterval(() => document.visibilityState === "visible" && load(), 60_000) : undefined;
    return () => {
      stale = true;
      if (id) clearInterval(id);
    };
  }, [tournamentId, golfer.id, live]);

  const round = Array.isArray(rounds) ? rounds[tab] : undefined;
  const front = round?.holes.filter((h) => h.hole <= 9) ?? [];
  const back = round?.holes.filter((h) => h.hole > 9) ?? [];

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className="m-auto w-[min(40rem,calc(100vw-1rem))] rounded-xl bg-bg p-0 text-ink shadow-xl backdrop:bg-black/50"
      aria-label={`${golfer.name}: scorecard`}
    >
      <div className="max-h-[85vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-snug">{golfer.name}</h2>
            <p className="text-xs text-muted">
              {eventName}
              {golfer.pos ? ` · ${golfer.pos}` : ""}
              {golfer.toPar ? ` · ${golfer.toPar.replace(/^-/, "−")}` : ""}
            </p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className="-mr-1.5 -mt-1 grid size-9 place-items-center rounded-full text-xl text-muted hover:bg-surface" aria-label="Close">
            ×
          </button>
        </div>

        {rounds === null ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : rounds === "error" || rounds.length === 0 ? (
          <p className="mt-4 text-sm text-muted">The hole-by-hole scorecard isn&apos;t available for this golfer right now.</p>
        ) : (
          <>
            <div className="mt-3 flex gap-1" role="tablist" aria-label="Round">
              {rounds.map((r, i) => (
                <button
                  key={r.round}
                  type="button"
                  role="tab"
                  aria-selected={i === tab}
                  onClick={() => setTab(i)}
                  className={`h-8 rounded-full px-3 text-xs font-medium ${i === tab ? "bg-ink text-bg" : "bg-surface text-muted hover:text-ink"}`}
                >
                  R{r.round}
                  {r.strokes ? <span className="ml-1 tabular-nums opacity-80">{r.strokes}</span> : null}
                </button>
              ))}
            </div>
            {round && round.holes.length > 0 ? (
              <div className="mt-3 space-y-3 overflow-x-auto">
                <Nine holes={front} label="Out" />
                <Nine holes={back} label="In" />
                <p className="text-sm">
                  <span className="text-muted">Round {round.round}: </span>
                  <span className="font-bold tabular-nums">{round.strokes ?? "–"}</span>
                  {round.toPar && <span className={`ml-1.5 font-semibold tabular-nums ${round.toPar.startsWith("-") ? "text-loss" : ""}`}>({round.toPar.replace(/^-/, "−")})</span>}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">No hole scores for this round yet.</p>
            )}
            <p className="mt-3 text-[11px] text-muted">○ birdie · ◎ eagle · □ bogey · ▣ double bogey or worse{live ? " · updates every minute" : ""}</p>
          </>
        )}
      </div>
    </dialog>
  );
}
