import { Empty, PageTitle } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { claimSquare, releaseSquare } from "@/app/p/[slug]/formats/actions";
import type { PoolBase } from "@/lib/pool";
import { QUARTERS, shortName, squaresRules } from "@/lib/squares";
import { getSquares } from "@/lib/squaresData";
import { CommissionerBoard, PlayerBoard, StaticBoard, type GridCell } from "./SquaresGrid";

// A Squares pool is one page: the board, with the quarter winners, the pot and who has how
// many squares beside it. The pool routes reach this when settings.format is "squares"; the
// same view is what the board's link shows to people without an account (app/board/[token]),
// where they can also fill in squares when the pool lets players do that.

const card = "rounded-2xl bg-surface p-4 sm:p-5";
const WON = ["Q1", "Half", "Q3", "Final"];
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export async function SquaresHome({ ctx, slug }: { ctx: PoolBase; slug: string }) {
  const data = await getSquares({ supabase: ctx.supabase, pool: ctx.pool });
  return <SquaresBoardView data={data} slug={slug} commissioner={ctx.isCommissioner} />;
}

/** The board and its side panels. `commissioner`: the signed-in commissioner, who can write on any square while the board is open. */
export function SquaresBoardView({
  data,
  slug,
  commissioner = false,
  title,
}: {
  data: Awaited<ReturnType<typeof getSquares>>;
  slug: string;
  commissioner?: boolean;
  /** Shown above the matchup on the public page (the pool's name). */
  title?: string;
}) {
  const { settings, board, squares, scores, winners, live } = data;
  const taken = squares.size;
  const pot = settings.price * taken;
  const wonAt = (idx: number) => winners.map((w, q) => (w === idx ? WON[q] : null)).filter(Boolean).join("·") || null;
  const cells: GridCell[] = Array.from({ length: 100 }, (_, idx) => {
    const sq = squares.get(idx);
    return { name: sq?.label ?? null, short: sq ? shortName(sq.label) : null, mine: false, won: wonAt(idx) };
  });
  const players = settings.entry === "players";
  const common = { homeName: board.homeName, awayName: board.awayName, colDigits: board.colDigits, rowDigits: board.rowDigits };
  // Squares per name (however it's capitalized).
  const tally = [...squares.values()].reduce((m, s) => {
    const k = s.label.trim().toLowerCase();
    m.set(k, { name: m.get(k)?.name ?? s.label, n: (m.get(k)?.n ?? 0) + 1 });
    return m;
  }, new Map<string, { name: string; n: number }>());
  const names = [...tally.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  return (
    <>
      {title && <div className="text-xs font-semibold uppercase tracking-wide text-accent">{title}</div>}
      <PageTitle
        sub={
          board.drawn
            ? "The numbers are set and the board is locked."
            : `${taken} of 100 squares filled. ${players ? "Anyone with the board's link can put their name on squares" : "The commissioner fills in the names"}; the numbers go on once the board is full.`
        }
      >
        {board.awayName} vs {board.homeName}
      </PageTitle>
      {/* Live during the game, and while the board is still filling. */}
      {(live || !board.drawn) && <AutoRefresh active seconds={live ? 60 : 20} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <section className={`${card} !p-3 sm:!p-5`}>
          {board.drawn ? (
            <StaticBoard {...common} cells={cells} />
          ) : commissioner ? (
            <CommissionerBoard {...common} cells={cells} claim={claimSquare.bind(null, slug)} release={releaseSquare.bind(null, slug)} />
          ) : players && board.shareToken ? (
            <PlayerBoard {...common} token={board.shareToken} cells={cells} max={settings.max_per_entry} won={{}} />
          ) : (
            <StaticBoard {...common} cells={cells} />
          )}
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
                  <li key={m.name} className="flex items-center gap-2 py-2 text-sm">
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
