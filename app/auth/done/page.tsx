import { safeNext } from "@/lib/auth";
import { AuthDone } from "./AuthDone";

export default async function AuthDonePage({ searchParams }: PageProps<"/auth/done">) {
  const { next } = await searchParams;
  return <AuthDone next={safeNext(typeof next === "string" ? next : undefined)} />;
}
