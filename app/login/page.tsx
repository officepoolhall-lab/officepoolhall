import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/ui";
import { getUser, safeNext } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  if (await getUser()) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <Wordmark className="text-2xl" />
        <p className="mt-1 text-sm text-muted">College pick&apos;em, among friends.</p>
      </div>
      <LoginForm next={next} initialError={typeof params.error === "string" ? params.error : undefined} />
    </main>
  );
}
