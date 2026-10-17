"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { ActionState } from "./ActionForm";
import { buttonClass } from "./ui";

/** A button that runs a bound server action and shows its { error | ok } message. */
export function ActionButton({
  action,
  children,
  kind = "ghost",
  className = "",
  pendingLabel = "Working…",
}: {
  action: () => Promise<ActionState | void>;
  children: ReactNode;
  kind?: Parameters<typeof buttonClass>[0];
  className?: string;
  pendingLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        className={buttonClass(kind, className)}
        onClick={() => start(async () => setState((await action()) ?? null))}
      >
        {pending ? pendingLabel : children}
      </button>
      {state?.error && <span className="mt-1 max-w-xs text-xs text-loss" role="alert">{state.error}</span>}
      {state?.ok && <span className="mt-1 max-w-xs text-xs text-win">{state.ok}</span>}
    </span>
  );
}
