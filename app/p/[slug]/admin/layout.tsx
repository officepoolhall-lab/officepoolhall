import { AdminNav } from "@/components/AdminNav";
import { requireCommissioner } from "@/lib/pool";

export default async function AdminLayout({ children, params }: LayoutProps<"/p/[slug]/admin">) {
  const { slug } = await params;
  await requireCommissioner(slug);
  return (
    <>
      <AdminNav
        base={`/p/${slug}/admin`}
        tabs={[
          ["slate", "Slate"],
          ["roster", "Roster"],
          ["results", "Results"],
          ["settings", "Settings"],
        ]}
      />
      {children}
    </>
  );
}
