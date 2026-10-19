import { AdminNav } from "@/components/AdminNav";
import { requireCommissioner } from "@/lib/pool";

export default async function AdminLayout({ children, params }: LayoutProps<"/p/[slug]/admin">) {
  const { slug } = await params;
  await requireCommissioner(slug);
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
          ["settings", "Settings"],
        ]}
      />
      {children}
    </div>
  );
}
