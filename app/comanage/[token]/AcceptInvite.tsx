"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { acceptComanagerInvite } from "@/app/account/actions";

export function AcceptInvite({ token }: { token: string }) {
  const [state, accept, pending] = useActionState<{ error: string } | null>(async () => acceptComanagerInvite(token), null);
  return (
    <form action={accept} className="mt-6 space-y-3">
      <Button className="w-full" disabled={pending}>{pending ? "Joining…" : "Co-manage this entry"}</Button>
      {state?.error && <p className="text-sm text-loss" role="alert">{state.error}</p>}
    </form>
  );
}
