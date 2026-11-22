"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { holdSquare, saveHeldSquares, unholdSquare } from "@/app/board/actions";
import { buttonClass } from "@/components/ui";
import { initials } from "@/lib/squares";

export type GridCell = {
  name: string | null;
  short: string | null;
  /** Saved by this viewer (their squares stay blue). */
  mine: boolean;
  /** Tapped but not saved yet: by this viewer ("me", light blue) or by someone else ("other", being filled in). */
  held?: "me" | "other" | null;
  /** "Q1", "Half"… when this square has won. */
  won: string | null;
};

type Common = { homeName: string; awayName: string; colDigits: number[] | null; rowDigits: number[] | null };

/** The 10 × 10 board itself: columns are the home team's digit, rows the away team's (shown once set). */
function Grid({ cells, homeName, awayName, colDigits, rowDigits, canTap, onTap, busy }: Common & { cells: GridCell[]; canTap?: (c: GridCell) => boolean; onTap?: (idx: number, c: GridCell) => void; busy?: number | null }) {
  const digit = "flex aspect-square items-center justify-center rounded-md bg-ink text-xs font-bold tabular-nums text-bg sm:text-sm";
  return (
    <>
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
              const tappable = Boolean(onTap && canTap?.(cell));
              const state = cell.name ? `${cell.name}${cell.won ? ` · won ${cell.won}` : ""}` : cell.held === "me" ? "Yours once you save" : cell.held === "other" ? "Someone is filling this in" : "Open";
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={!tappable || (busy ?? null) !== null}
                  onClick={() => onTap?.(idx, cell)}
                  title={state}
                  aria-label={`Square ${idx + 1}: ${state}`}
                  className={`relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold leading-none ring-1 transition sm:text-xs ${
                    cell.won
                      ? "bg-[var(--win-fill)] text-win ring-2 ring-win"
                      : cell.mine
                        ? "bg-accent text-white ring-accent dark:text-black"
                        : cell.held === "me"
                          ? "bg-accent/25 text-accent ring-2 ring-accent"
                          : cell.held === "other"
                            ? "bg-[repeating-linear-gradient(135deg,var(--surface),var(--surface)_4px,var(--line)_4px,var(--line)_8px)] text-muted ring-line"
                            : !cell.name
                              ? `bg-bg text-faint ring-line ${tappable ? "hover:ring-2 hover:ring-accent" : ""}`
                              : `bg-surface text-ink ring-line ${tappable ? "hover:ring-2 hover:ring-accent" : ""}`
                  } ${busy === idx ? "opacity-50" : ""}`}
                >
                  <span className="truncate px-0.5 sm:hidden">{cell.short ?? (cell.held === "me" ? "✓" : cell.held === "other" ? "…" : "")}</span>
                  {/* The name on up to two lines, small enough to fit the square; the whole name is in
                      the hover text and the list beside the board. */}
                  <span className="hidden px-0.5 text-center text-[10px] leading-[1.15] [overflow-wrap:anywhere] line-clamp-2 sm:[display:-webkit-box] lg:text-[11px]">
                    {cell.name ?? (cell.held === "me" ? "Yours" : cell.held === "other" ? "…" : "")}
                  </span>
                  {/* Which quarter it won (the green outline alone on phones, where there's no room). */}
                  {cell.won && <span className="absolute right-0 top-0 hidden rounded-bl bg-win px-0.5 text-[9px] font-bold text-white sm:block">{cell.won}</span>}
                </button>
              );
            }),
          ])}
        </div>
      </div>
    </>
  );
}

const errorBox = "mb-3 rounded-xl bg-[var(--loss-fill)] px-3 py-2 text-sm font-medium text-loss";

/** The board as a picture: nothing to tap. */
export function StaticBoard(props: Common & { cells: GridCell[] }) {
  return <Grid {...props} />;
}

/**
 * The commissioner's board while it's open: type a name, tap every square it goes on (saved
 * at once). Tapping a filled square clears it, or renames it when a different name is typed.
 */
export function CommissionerBoard({ cells, claim, release, ...common }: Common & { cells: GridCell[]; claim: (idx: number, name: string) => Promise<{ error?: string }>; release: (idx: number) => Promise<{ error?: string }> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const tap = (idx: number, c: GridCell) => {
    if (busy !== null) return;
    const typed = name.trim();
    const clear = Boolean(c.name) && !(typed && typed !== c.name);
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
  return (
    <div>
      <label className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-bg p-3 ring-1 ring-line">
        <span className="text-sm font-semibold">Name for the square</span>
        <input
          value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Type a name" aria-label="Name to put on squares"
          className="h-10 min-w-0 flex-1 rounded-[10px] bg-surface px-3 text-[15px] outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-accent sm:max-w-60"
        />
        <span className="w-full text-xs text-muted">Type a name, then tap every square it goes on. Tap a filled square to clear it (or, with a different name typed, to rename it). As commissioner, your changes save right away.</span>
      </label>
      {error && <p role="alert" className={errorBox}>{error}</p>}
      <Grid {...common} cells={cells} canTap={() => true} onTap={tap} busy={busy} />
    </div>
  );
}

type Live = { squares: { i: number; n: string; m: boolean }[]; holds: { i: number; m: boolean }[]; open: boolean };

/** This browser's own random id: how the board knows which squares are this person's. */
function useHolder() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let v: string | null = null;
    try {
      v = localStorage.getItem("oph-squares-id");
      if (!v) {
        v = crypto.randomUUID();
        localStorage.setItem("oph-squares-id", v);
      }
    } catch {
      // Storage is off (private mode): an id for this visit only.
      v = crypto.randomUUID();
    }
    setId(v);
  }, []);
  return id;
}

/**
 * The board for someone filling it in through its link (no account): tap open squares (each
 * is held for three minutes and turns light blue; everyone else sees it as being filled in),
 * type a name, and Save. Saved squares turn solid blue for the person who saved them and can
 * only be changed by the commissioner. The board re-reads itself every few seconds.
 */
export function PlayerBoard({ token, cells, max, won, ...common }: Common & { token: string; /** The board as the page was rendered (no "mine" yet). */ cells: GridCell[]; max: number | null; /** Winning squares by index, e.g. { 37: "Q1" }. */ won: Record<number, string> }) {
  const router = useRouter();
  const holder = useHolder();
  const [live, setLive] = useState<Live | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error?: string; ok?: string } | null>(null);
  const stop = useRef(false);

  const load = useCallback(async () => {
    if (!holder) return;
    try {
      const res = await fetch(`/board/${token}/state?h=${encodeURIComponent(holder)}`, { cache: "no-store" });
      if (res.ok && !stop.current) setLive((await res.json()) as Live);
    } catch {
      // Offline for a moment: the next read catches up.
    }
  }, [holder, token]);

  useEffect(() => {
    stop.current = false;
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 3000);
    return () => {
      stop.current = true;
      clearInterval(t);
    };
  }, [load]);

  // The numbers were set while this page was open: show the finished board.
  useEffect(() => {
    if (live && !live.open) router.refresh();
  }, [live, router]);

  const view: GridCell[] = live
    ? Array.from({ length: 100 }, (_, i) => {
        const s = live.squares.find((x) => x.i === i);
        const h = live.holds.find((x) => x.i === i);
        return { name: s?.n ?? null, short: s ? initials(s.n) : null, mine: Boolean(s?.m), held: s ? null : h ? (h.m ? "me" : "other") : null, won: won[i] ?? null };
      })
    : cells;
  const held = view.filter((c) => c.held === "me").length;
  const saved = view.filter((c) => c.mine).length;
  const full = max !== null && held + saved >= max;

  const tap = async (idx: number, c: GridCell) => {
    if (!holder || busy !== null || saving) return;
    setBusy(idx);
    setMessage(null);
    const r = await (c.held === "me" ? unholdSquare(token, holder, idx) : holdSquare(token, holder, idx)).catch(() => ({ error: "That didn't work. Try again." }));
    if (r.error) setMessage({ error: r.error });
    await load();
    setBusy(null);
  };
  const save = async () => {
    if (!holder || saving) return;
    if (!name.trim()) return setMessage({ error: "Type your name, then press Save." });
    setSaving(true);
    setMessage(null);
    const r = await saveHeldSquares(token, holder, name).catch(() => ({ error: "That didn't save. Try again." }) as { error?: string; saved?: number });
    setMessage(r.error ? { error: r.error } : { ok: `Saved ${r.saved} square${r.saved === 1 ? "" : "s"} for ${name.trim()}.` });
    await load();
    router.refresh();
    setSaving(false);
  };

  return (
    <div>
      <div className="mb-3 rounded-xl bg-bg p-3 ring-1 ring-line">
        <ol className="mb-2 list-inside list-decimal space-y-0.5 text-sm text-ink">
          <li>Tap the open squares you want. They turn light blue and are held for you for three minutes.</li>
          <li>Type your name and press Save. Your saved squares stay solid blue.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Your name" aria-label="Your name"
            className="h-11 min-w-0 flex-1 rounded-[10px] bg-surface px-3 text-[15px] outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-accent sm:max-w-60"
          />
          <button type="button" onClick={save} disabled={saving || held === 0} className={buttonClass("accent", "disabled:opacity-40")}>
            {saving ? "Saving…" : held ? `Save ${held} square${held === 1 ? "" : "s"}` : "Save"}
          </button>
          <span className="text-sm text-muted tabular-nums">
            {saved} saved{max !== null ? ` of ${max}` : ""}
            {held ? ` · ${held} not saved yet` : ""}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          A saved square can&apos;t be changed (ask the commissioner). Striped squares are being filled in by someone else right now.
          {full ? ` You've reached the limit of ${max} squares.` : ""}
        </p>
        {message?.error && <p role="alert" className="mt-2 text-sm font-semibold text-loss">{message.error}</p>}
        {message?.ok && <p className="mt-2 text-sm font-semibold text-win">{message.ok}</p>}
      </div>
      <Grid {...common} cells={view} canTap={(c) => !c.name && c.held !== "other" && (c.held === "me" || !full)} onTap={tap} busy={busy} />
    </div>
  );
}
