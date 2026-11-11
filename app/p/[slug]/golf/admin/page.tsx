import { redirect } from "next/navigation";

/** Golf Admin opens on the Roster tab. */
export default async function GolfAdminIndex({ params }: PageProps<"/p/[slug]/golf/admin">) {
  const { slug } = await params;
  redirect(`/p/${slug}/golf/admin/roster`);
}
