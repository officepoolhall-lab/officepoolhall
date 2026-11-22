"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type GridCell = { name: string | null; short: string | null; mine: boolean; /** "Q1", "Half"… when this square has won. */ won: string | null };

/**
 * The 10 × 10 board. Columns are the home team's digit, rows the away team's (shown once set).
 * While the board is open, whoever can fill it types a name in the box above and taps squares
 * to put that name on them; tapping a square they can clear takes the name off.
 */
export function SquaresGrid({
  cells,
  homeName,
  awayName,
  colDigits,
  rowDigits,
  edit,
  claim,
  release,
}: {
  cells: GridCell[];
  homeName: string;
  awayName: string;
  colDigits: number[] | null;
  rowDigits: number[] | null;
  /** Null when the viewer can't change the board. `all`: the commissioner, who can fill or clear any square; otherwise only open squares and their own. */
  edit: { defaultName: string; all: boolean; note: string } | null;
  claim: (idx: number, name: string) => Promise<{ error?: string }>;
  release: (idx: number) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState(edit?.defaultName ?? "");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const canTap = (c: GridCell) => Boolean(edit) && (!c.name || c.mine || Boolean(edit?.all));
  const tap = (idx: number, c: GridCell) => {
    if (!edit || busy !== null || !canTap(c)) return;
    const typed = name.trim();
    // A filled square: clear it, unless the commissioner has a different name ready (then it's renamed).
    const clear = Boolean(c.name) && !(edit.all && typed && typed !== c.name);
    if (!clear && !typed) return setError("Type a name first, then tap a square.");
    setBusy(idx);
    setError(null);
    start(async () => {
      const r = await (clear ? release(idx) : claim(idx, typed)).catch(() => ({ error: "That didn't save. Try again." }));
      if (r.error) setError(r.error);
      router.refresh();
      setBusy(null);
    });
  };

  const digit = "flex aspect-square items-center justify-center rounded-md bg-ink text-xs font-bold tabular-nums text-bg sm:text-sm";
  return (
    <div>
      {edit && (
        <label className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-bg p-3 ring-1 ring-line">
          <span className="text-sm font-semibold">Name for the square</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="Type a name"
            aria-label="Name to put on squares"
            className="h-10 min-w-0 flex-1 rounded-[10px] bg-surface px-3 text-[15px] outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-accent sm:max-w-60"
          />
          <span className="w-full text-xs text-muted">{edit.note}</span>
        </label>
      )}
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
              const tappable = canTap(cell);
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
                        : !cell.name
                          ? `bg-bg text-faint ring-line ${tappable ? "hover:ring-2 hover:ring-accent" : ""}`
                          : `bg-surface text-ink ring-line ${tappable ? "hover:ring-2 hover:ring-accent" : ""}`
                  } ${busy === idx ? "opacity-50" : ""}`}
                >
                  <span className="truncate px-0.5 sm:hidden">{cell.short ?? ""}</span>
                  {/* A long name shows its first word; the whole name is in the hover text and the list beside the board. */}
                  <span className="hidden truncate px-1 sm:block">{cell.name ? (cell.name.length > 9 ? cell.name.split(" ")[0] : cell.name) : ""}</span>
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
