import { AdminNav } from "@/components/AdminNav";
import { requireCommissioner } from "@/lib/pool";

export default async function AdminLayout({ children, params }: LayoutProps<"/p/[slug]/admin">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  return (
    // data-wide: every admin page uses the full screen width on desktop.
    <div data-wide>
      <AdminNav
        base={`/p/${slug}/admin`}
        tabs={[
          // Roster first: it's where Admin opens.
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
