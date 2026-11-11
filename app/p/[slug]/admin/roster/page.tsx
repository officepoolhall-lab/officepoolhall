import type { Metadata } from "next";
import { AdminRoster } from "@/components/AdminRoster";
import { requireCommissioner } from "@/lib/pool";

export const metadata: Metadata = { title: "Roster" };

export default async function RosterPage({ params }: PageProps<"/p/[slug]/admin/roster">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  return <AdminRoster ctx={ctx} slug={slug} timezone={ctx.settings.timezone} />;
}
