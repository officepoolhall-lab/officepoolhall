"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { createComanagerInvite, type InviteState } from "./actions";

/** "Create invite link" for one pool's entry; shows the link to copy once it's made. */
export function ComanagerInvite({ poolId }: { poolId: string }) {
  const [state, create, pending] = useActionState<InviteState>(createComanagerInvite.bind(null, poolId), null);
  const link = state?.token ? `${window.location.origin}/comanage/${state.token}` : null;
  return (
    <div className="space-y-2">
      {link ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-[10px] bg-surface px-3 py-2.5 font-sans text-sm text-muted">{link}</code>
          <CopyButton text={link} />
        </div>
      ) : null}
      <form action={create}>
        <button disabled={pending} className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline disabled:opacity-50">
          {pending ? "Creating…" : link ? "Make a new link (the last one stops working)" : "Create invite link"}
        </button>
      </form>
      {link && <p className="text-xs text-muted">Send it to the person you want. It works once and expires in 14 days.</p>}
      {state?.error && <p className="text-sm text-loss" role="alert">{state.error}</p>}
    </div>
  );
}
