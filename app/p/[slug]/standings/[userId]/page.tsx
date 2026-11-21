import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PickHistoryView } from "@/components/PickHistoryView";
import { getPoolContext } from "@/lib/pool";

export const metadata: Metadata = { title: "Pick History" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PickHistoryPage({ params, searchParams }: PageProps<"/p/[slug]/standings/[userId]">) {
  const { slug, userId } = await params;
  const { view } = await searchParams;
  if (!UUID.test(userId)) notFound();
  const ctx = await getPoolContext(slug);
  const body = await PickHistoryView({ ctx, slug, userId, view: typeof view === "string" ? view : undefined });
  if (!body) notFound();
  return body;
}
