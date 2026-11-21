import type { Metadata } from "next";
import { StandingsView } from "@/components/StandingsView";
import { getPoolContext } from "@/lib/pool";

export const metadata: Metadata = { title: "Standings" };

export default async function StandingsPage({ params, searchParams }: PageProps<"/p/[slug]/standings">) {
  const { slug } = await params;
  const query = await searchParams;
  const ctx = await getPoolContext(slug);
  return <StandingsView ctx={ctx} slug={slug} query={query} />;
}
