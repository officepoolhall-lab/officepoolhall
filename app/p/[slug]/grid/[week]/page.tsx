import type { Metadata } from "next";
import { GridView } from "@/components/GridView";
import { getPoolContext } from "@/lib/pool";

export const metadata: Metadata = { title: "League Grid" };

export default async function GridPage({ params, searchParams }: PageProps<"/p/[slug]/grid/[week]">) {
  const { slug, week } = await params;
  const { sort } = await searchParams;
  const ctx = await getPoolContext(slug);
  return <GridView ctx={ctx} slug={slug} week={week} sortParam={sort} />;
}
