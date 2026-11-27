import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { poolFormat } from "@/lib/formats";
import { PfSummaryPage } from "@/components/playoff/PfPages";
import { getPoolContext } from "@/lib/pool";

export const metadata: Metadata = { title: "Pool Summary" };

/** Pool Summary: NFL Playoff Fantasy pools have one (Pick X pools have the Scoreboard instead). */
export default async function SummaryPage({ params, searchParams }: PageProps<"/p/[slug]/summary">) {
  const { slug } = await params;
  const week = (await searchParams).week;
  const ctx = await getPoolContext(slug);
  const format = poolFormat(ctx.pool.settings);
  if (format === "pick_x") redirect(`/p/${slug}/scoreboard`);
  if (format !== "playoff_fantasy") notFound();
  return <PfSummaryPage ctx={ctx} slug={slug} week={typeof week === "string" ? week : undefined} />;
}
