import { redirect } from "next/navigation";

/** /p/[slug]/admin opens on the Roster tab. */
export default async function AdminIndex({ params }: PageProps<"/p/[slug]/admin">) {
  const { slug } = await params;
  redirect(`/p/${slug}/admin/roster`);
}
