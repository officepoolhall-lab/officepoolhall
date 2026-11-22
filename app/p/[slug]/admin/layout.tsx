import { AdminNav } from "@/components/AdminNav";
import { isPickX } from "@/lib/pickx";
import { poolFormat } from "@/lib/formats";
import { requireCommissioner } from "@/lib/pool";

export default async function AdminLayout({ children, params }: LayoutProps<"/p/[slug]/admin">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  const format = poolFormat(ctx.pool.settings);
  return (
    // data-wide: every admin page uses the full screen width on desktop.
    <div data-wide>
      <AdminNav
        base={`/p/${slug}/admin`}
        tabs={isPickX(ctx.pool.settings) ? [
          // Pick X: the tournament field and winners (Bracket) and the rules (Settings).
          ["roster", "Roster"],
          ["bracket", "Bracket"],
          ["settings", "Settings"],
        ] : format === "survivor" ? [
          // Survivor: each week's games (Slate), fixing a result (Results) and the rules.
          ["roster", "Roster"],
          ["slate", "Slate"],
          ["results", "Results"],
          ["settings", "Settings"],
        ] : format === "squares" ? [
          // Squares: the game, the numbers and the scores (Board) and the rules.
          ["roster", "Roster"],
          ["board", "Board"],
          ["settings", "Settings"],
        ] : format === "playoff_fantasy" ? [
          // Playoff Fantasy: the playoff teams and player list (Players) and the rules.
          ["roster", "Roster"],
          ["players", "Players"],
          ["settings", "Settings"],
        ] : [
          // Roster first: it's where the Commissioner page opens.
          ["roster", "Roster"],
          ["slate", "Slate"],
          ["results", "Results"],
          // Basketball's in-season tournament champion picks.
          ...(ctx.pool.sport === "ncaab"
            ? [["tournaments", "Tournaments"] as [string, string], ["bracket", "Bracket"] as [string, string]]
            : []),
          ["settings", "Settings"],
        ]}
      />
      {children}
    </div>
  );
}
