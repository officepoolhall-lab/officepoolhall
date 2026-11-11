import { redirect } from "next/navigation";

/** Golf calls this page the Leaderboard; old links still land there. */
export default async function GolfScoreboardRedirect({ params, searchParams }: PageProps<"/p/[slug]/golf/scoreboard">) {
  const { slug } = await params;
  const { event } = await searchParams;
  redirect(`/p/${slug}/golf/leaderboard${typeof event === "string" ? `?event=${encodeURIComponent(event)}` : ""}`);
}
