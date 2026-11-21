"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type GridCell = { owner: string | null; name: string | null; short: string | null; mine: boolean; /** "Q1", "Half"… when this square has won. */ won: string | null };

/**
 * The 10 × 10 board. Columns are the home team's digit, rows the away team's (shown once
 * drawn). Until then, tap an open square to take it and one of yours to give it back.
 */
export function SquaresGrid({
  cells,
  homeName,
  awayName,
  colDigits,
  rowDigits,
  canClaim,
  claim,
  release,
}: {
  cells: GridCell[];
  homeName: string;
  awayName: string;
  colDigits: number[] | null;
  rowDigits: number[] | null;
  /** The board is open and the viewer can take squares. */
  canClaim: boolean;
  claim: (idx: number) => Promise<{ error?: string }>;
  release: (idx: number) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const tap = (idx: number, c: GridCell) => {
    if (!canClaim || busy !== null || (c.owner && !c.mine)) return;
    setBusy(idx);
    setError(null);
    start(async () => {
      const r = await (c.mine ? release(idx) : claim(idx)).catch(() => ({ error: "That didn't save. Try again." }));
      if (r.error) setError(r.error);
      router.refresh();
      setBusy(null);
    });
  };

  const digit = "flex aspect-square items-center justify-center rounded-md bg-ink text-xs font-bold tabular-nums text-bg sm:text-sm";
  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-[var(--loss-fill)] px-3 py-2 text-sm font-medium text-loss">{error}</p>}
      {/* The home team across the top, the away team down the side. */}
      <div className="mb-1 pl-7 text-center text-sm font-bold sm:pl-9">{homeName}</div>
      <div className="flex gap-1">
        <div className="flex w-6 items-center justify-center sm:w-8">
          <span className="-rotate-90 whitespace-nowrap text-sm font-bold">{awayName}</span>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-11 gap-0.5 sm:gap-1">
          <span />
          {Array.from({ length: 10 }, (_, c) => (
            <span key={`c${c}`} className={digit}>{colDigits ? colDigits[c] : "?"}</span>
          ))}
          {Array.from({ length: 10 }, (_, r) => [
            <span key={`r${r}`} className={digit}>{rowDigits ? rowDigits[r] : "?"}</span>,
            ...Array.from({ length: 10 }, (_, c) => {
              const idx = r * 10 + c;
              const cell = cells[idx];
              const open = !cell.owner;
              const tappable = canClaim && (open || cell.mine);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!tappable || busy !== null}
                  onClick={() => tap(idx, cell)}
                  title={cell.name ? `${cell.name}${cell.won ? ` · won ${cell.won}` : ""}` : "Open"}
                  aria-label={`Square ${idx + 1}: ${cell.name ?? "open"}${cell.won ? `, won ${cell.won}` : ""}`}
                  className={`relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold leading-none ring-1 transition sm:text-xs ${
                    cell.won
                      ? "bg-[var(--win-fill)] text-win ring-2 ring-win"
                      : cell.mine
                        ? "bg-accent text-white ring-accent dark:text-black"
                        : open
                          ? `bg-bg text-faint ring-line ${tappable ? "hover:ring-2 hover:ring-accent" : ""}`
                          : "bg-surface text-ink ring-line"
                  } ${busy === idx ? "opacity-50" : ""}`}
                >
                  <span className="truncate px-0.5 sm:hidden">{cell.short ?? ""}</span>
                  <span className="hidden truncate px-1 sm:block">{cell.name ? cell.name.split(" ")[0] : ""}</span>
                  {/* Which quarter it won (the green outline alone on phones, where there's no room). */}
                  {cell.won && <span className="absolute right-0 top-0 hidden rounded-bl bg-win px-0.5 text-[9px] font-bold text-white sm:block">{cell.won}</span>}
                </button>
              );
            }),
          ])}
        </div>
      </div>
    </div>
  );
}
