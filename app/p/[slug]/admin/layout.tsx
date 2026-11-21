import { AdminNav } from "@/components/AdminNav";
import { isPickX } from "@/lib/pickx";
import { requireCommissioner } from "@/lib/pool";

export default async function AdminLayout({ children, params }: LayoutProps<"/p/[slug]/admin">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
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
