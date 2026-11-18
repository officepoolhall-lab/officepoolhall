import type { CSSProperties, ReactNode } from "react";
import { FitText } from "@/components/FitText";
import { TeamLogo } from "@/components/ui";
import { formatSpread, points } from "@/lib/format";

type Team = { id: string; abbreviation: string | null; logo_url: string | null; short_name?: string | null; name?: string | null };
type Game = { id: string; home: Team; away: Team; spread: number | null; voided: boolean };
type Pick = { user_id: string; game_id: string; picked_side: string; confidence: number | null; result: string | null; bonus?: number | null };

/**
 * The Grid's side panel on wide screens: the week's most-picked teams, how the pool's picks
 * are doing game by game, and the viewer's picks beside the pool's. Built from the picks the
 * Grid already shows (`revealed` games only), so it never shows more than the Grid does.
 *
 * It never scrolls: the panel is the Grid's height and its rows share that space, between
 * 18px and 28px each. Long weeks (basketball's 25 games) list the games in two columns and
 * the viewer's picks as a grid of chips so everything fits.
 */
export function GridPanel({
  games,
  picks,
  revealed,
  me,
  ats,
  confidence,
  layout = "side",
}: {
  games: Game[];
  picks: Pick[];
  revealed: (gameId: string) => boolean;
  /** The viewer's entry, or null for a guest. */
  me: string | null;
  ats: boolean;
  confidence: boolean;
  /** "side": the column beside the Grid on wide screens, sized to never scroll. "drawer": the
      same content in the Pool Summary pop-out on smaller screens, at its natural height. */
  layout?: "side" | "drawer";
}) {
  const drawer = layout === "drawer";
  const shown = games.filter((g) => !g.voided && revealed(g.id));
  const byId = new Map(shown.map((g) => [g.id, g]));
  const visible = picks.filter((p) => byId.has(p.game_id) && p.result !== "void");
  if (!visible.length) {
    return (
      <Panel drawer={drawer}>
        <p className="text-sm text-muted">The pool&apos;s picks show here once games kick off.</p>
      </Panel>
    );
  }

  // ---------- Most picked: a team on one game; covered/won once its picks are graded ----------
  type Side = { game: Game; side: "home" | "away"; n: number; result: string | null };
  const sides = new Map<string, Side>();
  for (const p of visible) {
    const side = p.picked_side === "home" ? "home" : "away";
    const k = `${p.game_id}:${side}`;
    const s = sides.get(k) ?? { game: byId.get(p.game_id)!, side, n: 0, result: null };
    s.n++;
    if (p.result) s.result = p.result;
    sides.set(k, s);
  }
  const entries = new Set(picks.map((p) => p.user_id)).size;
  const most = [...sides.values()].sort((a, b) => b.n - a.n).slice(0, 6);

  // ---------- Confidence pools: upset bonuses earned (graded correct picks with a bonus) ----------
  const earned = new Map<string, { game: Game; side: "home" | "away"; bonus: number; n: number }>();
  for (const p of visible) {
    const bonus = Number(p.bonus ?? 0);
    if (p.result !== "win" || bonus <= 0) continue;
    const side = p.picked_side === "home" ? "home" : "away";
    const k = `${p.game_id}:${side}`;
    const e = earned.get(k) ?? { game: byId.get(p.game_id)!, side, bonus, n: 0 };
    e.n++;
    e.bonus = Math.max(e.bonus, bonus);
    earned.set(k, e);
  }
  const bonuses = [...earned.values()].sort((a, b) => b.bonus - a.bonus || b.n - a.n);
  const verdict = (r: string | null) =>
    r === "win" ? <span className="text-win">{ats ? "Covered" : "Won"}</span> : r === "loss" ? <span className="text-loss">Lost</span> : r === "push" ? <span className="text-muted">Push</span> : <span className="text-faint">—</span>;

  // ---------- The pool by game ----------
  const perGame = shown
    .map((g) => {
      const ps = visible.filter((p) => p.game_id === g.id);
      const w = ps.filter((p) => p.result === "win").length;
      const l = ps.filter((p) => p.result === "loss").length;
      const pu = ps.filter((p) => p.result === "push").length;
      // The side that won (covered, against the spread): the one whose picks won, else the
      // other side of the picks that lost. Null for a push or a game not graded yet.
      const side = ps.find((p) => p.result === "win")?.picked_side ?? (() => {
        const lost = ps.find((p) => p.result === "loss")?.picked_side;
        return lost ? (lost === "home" ? "away" : "home") : null;
      })();
      const winner = side ? (side === "home" ? g.home : g.away) : null;
      return { g, total: ps.length, w, l, pu, graded: w + l + pu > 0, winner };
    })
    .filter((x) => x.total > 0);
  const tw = perGame.reduce((t, x) => t + x.w, 0);
  const tl = perGame.reduce((t, x) => t + x.l, 0);
  const tp = perGame.reduce((t, x) => t + x.pu, 0);
  const twoCols = perGame.length > 16;

  // ---------- The viewer's picks beside the pool's ----------
  const mine = me ? visible.filter((p) => p.user_id === me).sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)) : [];
  // The share of the picks on this game that took the same side (not of the whole pool: most entries skip any one game).
  const share = (p: Pick) => {
    const s = sides.get(`${p.game_id}:${p.picked_side === "home" ? "home" : "away"}`)?.n ?? 0;
    const all = visible.filter((x) => x.game_id === p.game_id).length;
    return all ? Math.round((s / all) * 100) : 0;
  };
  const teamOf = (p: Pick) => {
    const g = byId.get(p.game_id)!;
    return p.picked_side === "home" ? g.home : g.away;
  };
  const lineOf = (p: Pick) => {
    const g = byId.get(p.game_id)!;
    return ats && g.spread !== null ? ` ${formatSpread(p.picked_side === "home" ? g.spread : -g.spread)}` : "";
  };
  const chips = mine.length > 8;

  return (
    <Panel drawer={drawer}>
      <Section drawer={drawer} title="Most picked" rows={most.length}>
        {most.map((s) => {
          const team = s.side === "home" ? s.game.home : s.game.away;
          return (
            <Row key={`${s.game.id}:${s.side}`}>
              <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-4" />
              <FitText min={8} className="w-12 shrink-0 font-semibold">{team.abbreviation}</FitText>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((s.n / Math.max(entries, 1)) * 100)}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right tabular-nums text-muted">{s.n}</span>
              <span className="w-14 shrink-0 text-right text-[11px] font-semibold">{verdict(s.result)}</span>
            </Row>
          );
        })}
      </Section>

      <Section
        drawer={drawer}
        title={ats ? "Pool against the spread" : "Pool by game"}
        rows={twoCols ? Math.ceil(perGame.length / 2) : perGame.length}
        cols={twoCols ? 2 : 1}
        divided
        foot={
          tw + tl + tp > 0 ? (
            <>
              Pool: <span className="font-semibold text-ink tabular-nums">{tw}–{tl}{tp ? `–${tp}` : ""}</span> this week
            </>
          ) : null
        }
      >
        {perGame.map(({ g, total, w, l, pu, graded, winner }) => (
          // The row sizes its label to its own width (a container query): the team's name where
          // it fits (one column), its abbreviation where that fits (two columns), else the logo alone.
          <Row key={g.id} container>
            {/* Just the side that won; the pool's record on the game follows. */}
            <span className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold" title={`${winner ? `${winner.short_name ?? winner.abbreviation} ${ats ? "covered" : "won"} · ` : ""}${g.away.abbreviation} @ ${g.home.abbreviation}`}>
              {winner ? (
                <>
                  <TeamLogo src={winner.logo_url} abbr={winner.abbreviation} className="size-4" />
                  <span className="hidden min-w-0 truncate @min-[14rem]:inline">{winner.short_name ?? winner.name ?? winner.abbreviation}</span>
                  <FitText min={8} className={`hidden @min-[14rem]:!hidden ${ats ? "@min-[8.75rem]:block" : "@min-[6.5rem]:block"}`}>{winner.abbreviation}</FitText>
                  {/* The line the winner covered, from its side. */}
                  {ats && g.spread !== null && (
                    <span className="shrink-0 font-normal tabular-nums text-muted">{formatSpread(winner === g.home ? g.spread : -g.spread)}</span>
                  )}
                </>
              ) : (
                <span className="truncate font-normal text-muted">{graded ? "Push" : "Live"}</span>
              )}
            </span>
            <span className="shrink-0 text-right tabular-nums text-muted">
              {graded ? `${w}–${l}${pu ? `–${pu}` : ""}` : total}
            </span>
          </Row>
        ))}
      </Section>

      {/* Confidence pools: the teams that paid an upset bonus this week, and to how many entries. */}
      {confidence && (
        <Section drawer={drawer} title="Upset bonuses earned" rows={Math.max(bonuses.length, 1)}>
          {bonuses.length ? (
            bonuses.map((b) => {
              const team = b.side === "home" ? b.game.home : b.game.away;
              return (
                <Row key={`${b.game.id}:${b.side}`}>
                  <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-4" />
                  <FitText min={8} className="w-12 shrink-0 font-semibold">{team.abbreviation}</FitText>
                  <span className="font-semibold tabular-nums text-accent">+{points(b.bonus)}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted">
                    {b.n} {b.n === 1 ? "entry" : "entries"}
                  </span>
                </Row>
              );
            })
          ) : (
            <Row>
              <span className="text-muted">None yet this week.</span>
            </Row>
          )}
        </Section>
      )}

      {!confidence && me && mine.length > 0 && (
        <Section drawer={drawer} title="Your picks vs the pool" rows={chips ? Math.ceil(mine.length / 5) : mine.length} cols={chips ? 5 : 1}>
          {mine.map((p) => {
            const team = teamOf(p);
            const tone = p.result === "win" ? "text-win" : p.result === "loss" ? "text-loss" : "text-ink";
            if (chips) {
              return (
                <Row key={p.game_id} center>
                  <span className="min-w-0" title={`${team.abbreviation}: ${share(p)}% of the picks on this game`}>
                    <FitText min={8} className={`font-semibold ${tone}`}>
                      {team.abbreviation}
                      {confidence && p.confidence !== null && <span className="ml-0.5 text-muted">{p.confidence}</span>}
                    </FitText>
                  </span>
                </Row>
              );
            }
            return (
              <Row key={p.game_id}>
                <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-4" />
                <FitText min={8} className={`flex-1 font-semibold ${tone}`}>
                  {team.abbreviation}
                  {lineOf(p)}
                  {confidence && p.confidence !== null && <span className="ml-1 font-normal text-muted">· {points(p.confidence)}</span>}
                </FitText>
                <span className="shrink-0 tabular-nums text-muted">{share(p)}% of picks</span>
                <span className={`w-4 shrink-0 text-right text-[11px] font-semibold ${tone}`}>
                  {p.result === "win" ? "W" : p.result === "loss" ? "L" : p.result === "push" ? "P" : ""}
                </span>
              </Row>
            );
          })}
        </Section>
      )}
    </Panel>
  );
}

function Panel({ children, drawer }: { children: ReactNode; drawer: boolean }) {
  if (drawer) return <div className="flex flex-col gap-5 text-sm">{children}</div>;
  // Hidden until the page's media rule shows it (only when it leaves the Grid enough room).
  return (
    <aside id="grid-panel" aria-label="This week in the pool" className="hidden w-72 shrink-0 flex-col gap-3 overflow-hidden border-l border-line pl-5 text-xs">
      {children}
    </aside>
  );
}

/**
 * A heading and its rows. Beside the Grid the rows grow with the room (flex-grow by row count)
 * up to 28px each; in the drawer they take their natural height.
 */
function Section({
  title,
  rows,
  cols = 1,
  divided = false,
  foot,
  drawer,
  children,
}: {
  title: string;
  rows: number;
  cols?: number;
  /** Two columns: a thin blue line down the gap between them. */
  divided?: boolean;
  foot?: ReactNode;
  drawer: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="flex min-h-0 flex-col"
      style={drawer ? undefined : { flexGrow: rows, flexShrink: 1, flexBasis: 0, maxHeight: `${rows * 1.75 + (foot ? 3.75 : 2.5)}rem` }}
    >
      <h3 className="mb-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-accent">{title}</h3>
      <ul
        className={`grid min-h-0 gap-x-3 ${drawer ? "divide-y divide-line" : "flex-1"} ${
          divided && cols === 2
            ? "relative gap-x-5 before:pointer-events-none before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-[color-mix(in_srgb,var(--accent)_45%,transparent)] before:content-['']"
            : ""
        }`}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, ${drawer ? "minmax(2.25rem, auto)" : "minmax(18px, 1.75rem)"})`, gridAutoFlow: "column" } as CSSProperties}
      >
        {children}
      </ul>
      {foot && <p className="mt-1 shrink-0 text-muted">{foot}</p>}
    </section>
  );
}

function Row({ children, center = false, container = false }: { children: ReactNode; center?: boolean; container?: boolean }) {
  return <li className={`flex min-w-0 items-center gap-2 overflow-hidden ${center ? "justify-center" : ""} ${container ? "@container" : ""}`}>{children}</li>;
}
