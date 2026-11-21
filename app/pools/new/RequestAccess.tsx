import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { requestPoolAccess } from "./actions";

type Request = { pools: string; group_size: string; message: string; created_at: string } | null;

/**
 * What /pools/new shows an account that can't start pools yet: why (pricing and payments are
 * still being finished), and a short form to ask to run one. A request they already sent is
 * shown and can be updated in place.
 */
export function RequestAccess({ email, request }: { email: string; request: Request }) {
  const field = "w-full rounded-[10px] bg-bg px-3 text-sm outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-accent";
  return (
    <div className="max-w-xl">
      <p className="text-muted">
        Right now, new pools are opened by us while pricing and payments are being finished. Tell us about the pool you want to
        run, and you&apos;ll get an email at <span className="font-semibold text-ink">{email}</span> as soon as your account can
        start pools.
      </p>
      <p className="mt-3 text-sm text-muted">
        Joining a pool is different: if someone invited you, just open the invite link they sent you.
      </p>

      {request && (
        <p className="mt-5 rounded-xl bg-[var(--win-fill)] px-4 py-3 text-sm font-medium text-win">
          Your request is in — sent {new Date(request.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric" })}. You can update it below.
        </p>
      )}

      <ActionForm action={requestPoolAccess} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">What do you want to run?</span>
          <input name="pools" defaultValue={request?.pools} placeholder="NFL Supercontest and a March Madness Pick X" className={`${field} h-11`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">About how many players?</span>
          <input name="group_size" defaultValue={request?.group_size} placeholder="40" className={`${field} h-11 max-w-40`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Anything else? <span className="font-normal text-muted">(optional)</span></span>
          <textarea name="message" defaultValue={request?.message} rows={3} placeholder="Special rules, when your season starts, where you run it today…" className={`${field} py-2.5`} />
        </label>
        <SubmitButton pending="Sending…">{request ? "Update request" : "Request to run a pool"}</SubmitButton>
      </ActionForm>

      <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
        Curious what you&apos;d be getting? The{" "}
        <Link href="/" className="font-semibold text-accent hover:underline">home page</Link> shows the pools and previews of the
        real thing.
      </p>
    </div>
  );
}
