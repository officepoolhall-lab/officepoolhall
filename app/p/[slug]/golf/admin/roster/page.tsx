import type { Metadata } from "next";
import { AdminRoster } from "@/components/AdminRoster";
import { getGolfContext } from "@/lib/golf";

export const metadata: Metadata = { title: "Roster" };

/** The same roster as football and basketball (the admin layout has already checked the commissioner). */
export default async function GolfRosterPage({ params }: PageProps<"/p/[slug]/golf/admin/roster">) {
  const { slug } = await params;
  const ctx = await getGolfContext(slug);
  return <AdminRoster ctx={ctx} slug={slug} timezone={ctx.displayTz} />;
}
