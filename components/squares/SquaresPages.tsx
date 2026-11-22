import { Empty, PageTitle } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { claimSquare, releaseSquare } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { QUARTERS, initials, squaresRules } from "@/lib/squares";
import { getSquares } from "@/lib/squaresData";
import { SquaresGrid, type GridCell } from "./SquaresGrid";

// A Super Bowl Squares pool is one page: the board, with the quarter winners, the pot and who
// has how many squares beside it. The pool routes reach this when settings.format is "squares".

const card = "rounded-2xl bg-surface p-4 sm:p-5";
const WON = ["Q1", "Half", "Q3", "Final"];
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export async function SquaresHome({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const { settings, board, squares, scores, winners, live, myName } = await getSquares(ctx);
  const taken = squares.size;
  const mineCount = [...squares.values()].filter((s) => s.userId === ctx.user.id).length;
  const pot = settings.price * taken;
  const cells: GridCell[] = Array.from({ length: 100 }, (_, idx) => {
    const sq = squares.get(idx);
    const won = winners.map((w, q) => (w === idx ? WON[q] : null)).filter(Boolean).join("·") || null;
    return { name: sq?.label ?? null, short: sq ? initials(sq.label) : null, mine: Boolean(sq?.userId && sq.userId === ctx.user.id), won };
  });
  // Who can fill the board while it's open: the commissioner always; players when the pool lets them.
  const players = settings.entry === "players";
  const full = players && settings.max_per_entry !== null && mineCount >= settings.max_per_entry;
  const edit = board.drawn
    ? null
    : ctx.isCommissioner
      ? { defaultName: "", all: true, note: "Type a name, then tap every square it goes on. Tap a filled square to clear it (or, with a different name typed, to rename it)." }
      : players && !ctx.isGuest
        ? {
            defaultName: myName,
            all: false,
            note: full
              ? `You have your ${settings.max_per_entry} squares. Tap one of yours to give it back.`
              : `Tap an open square to put this name on it${settings.max_per_entry ? ` (${mineCount} of ${settings.max_per_entry} taken)` : ""}. Tap one of yours to give it back.`,
          }
        : null;
  // Squares per name (however it's capitalized).
  const tally = [...squares.values()].reduce((m, s) => {
    const k = s.label.trim().toLowerCase();
    m.set(k, { name: m.get(k)?.name ?? s.label, n: (m.get(k)?.n ?? 0) + 1, mine: (m.get(k)?.mine ?? false) || s.userId === ctx.user.id });
    return m;
  }, new Map<string, { name: string; n: number; mine: boolean }>());
  const names = [...tally.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  return (
    <>
      <PageTitle
        sub={
          board.drawn
            ? "The numbers are set and the board is locked."
            : `${taken} of 100 squares filled. ${players ? "Players put their own names on squares" : "The commissioner fills in the names"}; the numbers come once the board is ready.`
        }
      >
        {board.awayName} vs {board.homeName}
      </PageTitle>
      {live && <AutoRefresh active />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <section className={`${card} !p-3 sm:!p-5`}>
          <SquaresGrid
            cells={cells}
            homeName={board.homeName}
            awayName={board.awayName}
            colDigits={board.colDigits}
            rowDigits={board.rowDigits}
            edit={edit}
            claim={claimSquare.bind(null, slug)}
            release={releaseSquare.bind(null, slug)}
          />
          <p className="mt-3 text-xs text-muted">
            Columns are the last digit of the {board.homeName} score; rows, the {board.awayName} score.
          </p>
        </section>

        <div className="space-y-4">
          <section className={card}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">Winners</h2>
              {live && <span className="text-xs font-semibold text-live">{live}</span>}
            </div>
            <ul className="mt-1 divide-y divide-line">
              {QUARTERS.map((q, i) => {
                const s = scores[i];
                const w = winners[i];
                const owner = w !== null ? squares.get(w) : undefined;
                const share = settings.payouts[i];
                return (
                  <li key={q} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{q}</span>
                      <span className="block text-xs text-muted tabular-nums">
                        {s ? `${board.awayName} ${s.away}, ${board.homeName} ${s.home}` : "Not played yet"}
                        {share > 0 && pot > 0 ? ` · ${money((pot * share) / 100)}` : share > 0 ? ` · ${share}%` : ""}
                      </span>
                    </span>
                    <span className={`max-w-32 truncate text-right font-semibold ${s && w !== null ? "text-win" : "text-faint"}`}>
                      {!s ? "—" : !board.drawn ? "Numbers not set" : owner ? owner.label : "Open square"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={card}>
            <h2 className="text-base font-bold">The pot</h2>
            <dl className="mt-1 grid grid-cols-3 gap-2 text-center">
              {[
                ["Filled", `${taken}/100`],
                ["Per square", settings.price > 0 ? money(settings.price) : "Free"],
                ["Pot", settings.price > 0 ? money(pot) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-bg px-1 py-2">
                  <dt className="text-[11px] text-muted">{k}</dt>
                  <dd className="text-sm font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-3 space-y-1 text-sm text-ink">
              {squaresRules(settings).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>

          <section className={card}>
            <h2 className="text-base font-bold">Who has squares</h2>
            {names.length === 0 ? (
              <Empty>No squares filled yet.</Empty>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {names.map((m) => (
                  <li key={m.name} className={`flex items-center gap-2 py-2 text-sm ${m.mine ? "font-semibold text-accent" : ""}`}>
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="tabular-nums text-muted">{m.n}</span>
                    {settings.price > 0 && <span className="w-14 text-right tabular-nums text-muted">{money(m.n * settings.price)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
