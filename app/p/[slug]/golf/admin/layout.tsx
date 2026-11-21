import { notFound } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { PageTitle } from "@/components/ui";
import { getGolfContext, golfFormat } from "@/lib/golf";

/** Golf's commissioner pages: Roster, Tournaments, Settings. Commissioner only (others get 404). */
export default async function GolfAdminLayout({ children, params }: LayoutProps<"/p/[slug]/golf/admin">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  if (!ctx.isCommissioner) notFound();
  return (
    <div data-wide>
      <PageTitle>Commissioner</PageTitle>
      <AdminNav
        base={`/p/${slug}/golf/admin`}
        tabs={[
          ["roster", "Roster"],
          // Majors pools: each major's field (tiers or salaries) gets its own tab.
          ["tournaments", golfFormat(ctx.pool) === "majors" ? "Majors" : "Tournaments"],
          ...(golfFormat(ctx.pool) === "majors" ? [["field", "Field"] as [string, string]] : []),
          ["settings", "Settings"],
        ]}
      />
      {children}
    </div>
  );
}
