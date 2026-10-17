"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, Wordmark } from "@/components/ui";
import { openAuthChannel, type AuthMessage } from "@/lib/authChannel";

// Where a magic link lands after signing in. If the tab that asked for the link is still
// open in this browser, it takes over and this tab says it can be closed; otherwise this
// tab simply continues.
export function AuthDone({ next }: { next: string }) {
  const router = useRouter();
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    const channel = openAuthChannel();
    if (!channel) {
      router.replace(next);
      return;
    }
    channel.onmessage = (e: MessageEvent<AuthMessage>) => {
      if (e.data?.type === "claimed") setClaimed(true);
    };
    channel.postMessage({ type: "signed-in" } satisfies AuthMessage);
    const t = setTimeout(() => {
      setClaimed((c) => {
        if (!c) router.replace(next);
        return c;
      });
    }, 800);
    return () => {
      clearTimeout(t);
      channel.close();
    };
  }, [next, router]);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <Wordmark className="mb-6 text-xl" />
      {claimed ? (
        <>
          <p className="text-lg font-semibold">You&apos;re signed in.</p>
          <p className="mt-1 text-[15px] text-muted">Your other tab is continuing. You can close this one.</p>
          <button type="button" onClick={() => router.replace(next)} className={buttonClass("secondary", "mt-6")}>
            Continue here instead
          </button>
        </>
      ) : (
        <p className="text-[15px] text-muted">Signing you in…</p>
      )}
    </main>
  );
}
