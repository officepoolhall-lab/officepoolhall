import Link from "next/link";
import { requireCommissioner } from "@/lib/pool";

export default async function AdminLayout({ children, params }: LayoutProps<"/p/[slug]/admin">) {
  const { slug } = await params;
  await requireCommissioner(slug);
  const base = `/p/${slug}/admin`;
  return (
    <>
      <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-border px-4">
        {[
          ["slate", "Slate"],
          ["roster", "Roster"],
          ["results", "Results"],
          ["settings", "Settings"],
        ].map(([path, label]) => (
          <Link key={path} href={`${base}/${path}`} className="min-h-10 shrink-0 px-3 pt-2 font-display text-sm font-semibold uppercase tracking-wide text-muted hover:text-ink">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
