import type { Metadata } from "next";
import { isPickX } from "@/lib/pickx";
import { PickXStandingsPage } from "@/components/pickx/PickXPages";
import { StandingsView } from "@/components/StandingsView";
import { redirect } from "next/navigation";
import { poolFormat } from "@/lib/formats";
import { SurvivorStandingsPage } from "@/components/survivor/SurvivorPages";
import { PfStandingsPage } from "@/components/playoff/PfPages";
import { getPoolContext } from "@/lib/pool";

export const metadata: Metadata = { title: "Standings" };

export default async function StandingsPage({ params, searchParams }: PageProps<"/p/[slug]/standings">) {
  const { slug } = await params;
  const query = await searchParams;
  const ctx = await getPoolContext(slug);
  if (isPickX(ctx.pool.settings)) return <PickXStandingsPage ctx={ctx} slug={slug} />;
  const format = poolFormat(ctx.pool.settings);
  if (format === "survivor") return <SurvivorStandingsPage ctx={ctx} slug={slug} />;
  if (format === "playoff_fantasy") return <PfStandingsPage ctx={ctx} slug={slug} />;
  // A Squares pool's winners are on its board.
  if (format === "squares") redirect(`/p/${slug}`);
  return <StandingsView ctx={ctx} slug={slug} query={query} />;
}
