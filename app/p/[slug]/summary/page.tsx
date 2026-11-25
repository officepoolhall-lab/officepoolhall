import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { poolFormat } from "@/lib/formats";
import { PfSummaryPage } from "@/components/playoff/PfPages";
import { PickXSummaryPage } from "@/components/pickx/PickXPages";
import { getPoolContext } from "@/lib/pool";

export const metadata: Metadata = { title: "Pool Summary" };

/** Pool Summary: NFL Playoff Fantasy and NCAA Pick X pools have one. */
export default async function SummaryPage({ params }: PageProps<"/p/[slug]/summary">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const format = poolFormat(ctx.pool.settings);
  if (format === "pick_x") return <PickXSummaryPage ctx={ctx} slug={slug} />;
  if (format !== "playoff_fantasy") notFound();
  return <PfSummaryPage ctx={ctx} slug={slug} />;
}
