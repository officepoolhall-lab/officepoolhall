import type { Metadata } from "next";
import { isPickX } from "@/lib/pickx";
import { redirect } from "next/navigation";
import { GridView } from "@/components/GridView";
import { getPoolContext } from "@/lib/pool";

export const metadata: Metadata = { title: "League Grid" };

export default async function GridPage({ params, searchParams }: PageProps<"/p/[slug]/grid/[week]">) {
  const { slug, week } = await params;
  const { sort } = await searchParams;
  const ctx = await getPoolContext(slug);
  if (isPickX(ctx.pool.settings)) redirect(`/p/${slug}/standings`);
  return <GridView ctx={ctx} slug={slug} week={week} sortParam={sort} />;
}
