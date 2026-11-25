import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { poolFormat } from "@/lib/formats";
import { PfSummaryPage } from "@/components/playoff/PfPages";
import { getPoolContext } from "@/lib/pool";

export const metadata: Metadata = { title: "Pool Summary" };

/** Pool Summary: only NFL Playoff Fantasy pools have one. */
export default async function SummaryPage({ params }: PageProps<"/p/[slug]/summary">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  if (poolFormat(ctx.pool.settings) !== "playoff_fantasy") notFound();
  return <PfSummaryPage ctx={ctx} slug={slug} />;
}
