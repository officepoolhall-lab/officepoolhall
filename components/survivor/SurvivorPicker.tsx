"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LockIcon, TeamLogo } from "@/components/ui";

export type PickerTeam = { id: string; name: string; abbreviation: string | null; logo_url: string | null; /** "Used · Week 3", when it can't be picked again. */ used: string | null };
export type PickerGame = { id: string; when: string; locked: boolean; home: PickerTeam; away: PickerTeam };

/**
 * The week's games, each a pair of teams to tap. One pick a week: tapping another team moves
 * it. Teams already used and games under way can't be picked.
 */
export function SurvivorPicker({
  games,
  pick,
  pickLocked,
  save,
}: {
  games: PickerGame[];
  pick: { gameId: string; teamId: string } | null;
  /** The current pick's game has started: it can't be changed. */
  pickLocked: boolean;
  save: (gameId: string, teamId: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState(pick?.teamId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choose = (g: PickerGame, t: PickerTeam) => {
    if (pending || t.id === chosen) return;
    const before = chosen;
    setChosen(t.id);
    setError(null);
    start(async () => {
      const r = await save(g.id, t.id).catch(() => ({ error: "That didn't save. Try again." }));
      if (r.error) {
        setChosen(before);
        setError(r.error);
      } else router.refresh();
    });
  };

  const team = (g: PickerGame, t: PickerTeam, side: "away" | "home") => {
    const on = t.id === chosen;
    const off = !on && (g.locked || pickLocked || Boolean(t.used));
    return (
      <button
        type="button"
        disabled={off || (on && pickLocked)}
        aria-pressed={on}
        onClick={() => choose(g, t)}
        className={`flex min-h-14 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-left ring-1 transition ${side === "home" ? "flex-row-reverse text-right" : ""} ${
          on ? "bg-accent text-white ring-accent dark:text-black" : off ? "bg-bg text-muted opacity-60 ring-line" : "bg-bg text-ink ring-line hover:ring-2 hover:ring-accent"
        }`}
      >
        <TeamLogo src={t.logo_url} abbr={t.abbreviation} className="size-8 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{t.name}</span>
          {t.used && !on && <span className="block truncate text-[11px] font-medium">{t.used}</span>}
          {on && <span className="block text-[11px] font-semibold">{pickLocked ? "Your pick · locked" : "Your pick"}</span>}
        </span>
      </button>
    );
  };

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-[var(--loss-fill)] px-3 py-2 text-sm font-medium text-loss">{error}</p>}
      <ul className="grid gap-3 lg:grid-cols-2">
        {games.map((g) => (
          <li key={g.id} className="rounded-2xl bg-surface p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
              {g.locked && <LockIcon className="size-3.5" />}
              {g.when}
              {g.locked && <span>· Started</span>}
            </div>
            <div className="flex items-stretch gap-2">
              {team(g, g.away, "away")}
              <span className="self-center text-xs font-semibold text-faint">@</span>
              {team(g, g.home, "home")}
            </div>
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="mt-3 h-5 text-sm text-muted">{pending ? "Saving…" : ""}</p>
    </div>
  );
}
