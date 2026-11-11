"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type ActionState } from "./ActionForm";
import { inputClass } from "./ui";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** One tournament's commissioner controls: rename it, and close, cancel or restore it. */
export function GolfEventAdminRow({
  name,
  status,
  action,
}: {
  name: string;
  status: "scheduled" | "in_progress" | "final" | "canceled";
  action: Action;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <ActionForm action={action} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input name="name" defaultValue={name} maxLength={120} required aria-label="Tournament name" autoFocus className={`${inputClass} h-9 min-w-0 flex-1 basis-56 text-sm`} />
          <SubmitButton className="!h-9 !px-3 !text-sm">Save</SubmitButton>
          <button type="button" onClick={() => setEditing(false)} className="h-9 px-2 text-sm text-muted hover:text-ink">
            Cancel
          </button>
        </ActionForm>
      ) : (
        <>
          <span className="min-w-0 flex-1 font-medium">{name}</span>
          <button type="button" onClick={() => setEditing(true)} className="h-8 rounded-full bg-surface px-3 text-xs font-medium text-muted hover:text-ink">
            Rename
          </button>
          {status === "in_progress" && (
            <ActionForm action={action} className="contents">
              <input type="hidden" name="status" value="final" />
              <SubmitButton
                className="!h-8 !px-3 !text-xs"
                onClick={(e) => {
                  if (!confirm(`Close "${name}" as final? Prize money and standings freeze at what ESPN shows now.`)) e.preventDefault();
                }}
              >
                Close as final
              </SubmitButton>
            </ActionForm>
          )}
          {(status === "scheduled" || status === "in_progress") && (
            <ActionForm action={action} className="contents">
              <input type="hidden" name="status" value="canceled" />
              <SubmitButton
                kind="danger"
                className="!h-8 !px-3 !text-xs"
                onClick={(e) => {
                  if (!confirm(`Cancel "${name}"? It won't count toward anyone's prize money. Golfers already picked for it still count as used.`)) e.preventDefault();
                }}
              >
                Cancel event
              </SubmitButton>
            </ActionForm>
          )}
          {status === "canceled" && (
            <ActionForm action={action} className="contents">
              <input type="hidden" name="status" value="scheduled" />
              <SubmitButton className="!h-8 !px-3 !text-xs">Restore</SubmitButton>
            </ActionForm>
          )}
        </>
      )}
    </div>
  );
}
