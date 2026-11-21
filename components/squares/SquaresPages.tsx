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

export async function SquaresHome({ ctx, slug, forUserId }: { ctx: PoolBase; slug: string; forUserId?: string }) {
  const { settings, board, claims, names, members, scores, winners, live } = await getSquares(ctx);
  // The commissioner taking squares for a player: ?for=<user id>.
  const behalf = Boolean(forUserId && ctx.isCommissioner && forUserId !== ctx.user.id && names.has(forUserId));
  const target = behalf ? forUserId! : ctx.entryUserId;
  const taken = claims.size;
  const mineCount = [...claims.values()].filter((u) => u === target).length;
  const pot = settings.price * taken;
  const cells: GridCell[] = Array.from({ length: 100 }, (_, idx) => {
    const owner = claims.get(idx) ?? null;
    const name = owner ? names.get(owner) ?? "Player" : null;
    const won = winners.map((w, q) => (w === idx ? WON[q] : null)).filter(Boolean).join("·") || null;
    return { owner, name, short: name ? initials(name) : null, mine: owner === target, won };
  });
  const isMember = members.some((m) => m.userId === target);
  const room = settings.max_per_entry === null || mineCount < settings.max_per_entry;
  const canClaim = !board.drawn && !ctx.isGuest && isMember;
  const tally = members
    .map((m) => ({ ...m, n: [...claims.values()].filter((u) => u === m.userId).length }))
    .filter((m) => m.n > 0)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  return (
    <>
      <PageTitle
        sub={
          board.drawn
            ? "The numbers are drawn and the board is locked."
            : `${taken} of 100 squares taken. Tap an open square to take it${settings.max_per_entry ? ` (up to ${settings.max_per_entry} each)` : ""}; tap one of yours to give it back.`
        }
      >
        {behalf ? <>Squares <span className="text-accent">for {names.get(target)}</span></> : `${board.awayName} vs ${board.homeName}`}
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
            canClaim={canClaim && (room || mineCount > 0)}
            claim={claimSquare.bind(null, slug, behalf ? target : null)}
            release={releaseSquare.bind(null, slug)}
          />
          <p className="mt-3 text-xs text-muted">
            Columns are the last digit of the {board.homeName} score; rows, the {board.awayName} score.{board.drawn ? "" : " The numbers are drawn at random once the board is ready."}
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
                const owner = w !== null ? claims.get(w) : undefined;
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
                      {!s ? "—" : !board.drawn ? "Numbers not drawn" : owner ? names.get(owner) ?? "Player" : "Open square"}
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
                ["Taken", `${taken}/100`],
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
            {tally.length === 0 ? (
              <Empty>No squares taken yet.</Empty>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {tally.map((m) => (
                  <li key={m.userId} className={`flex items-center gap-2 py-2 text-sm ${m.userId === ctx.entryUserId ? "font-semibold text-accent" : ""}`}>
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
