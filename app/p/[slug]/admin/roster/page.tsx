import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { Button, CheckIcon, Panel, SectionLabel } from "@/components/ui";
import { requireCommissioner } from "@/lib/pool";
import { removeMember, rotateInvite, setPaid } from "../actions";

export const metadata: Metadata = { title: "Roster" };

export default async function RosterPage({ params }: PageProps<"/p/[slug]/admin/roster">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  const [{ data: members }, { data: invite }, { data: emails, error: emailError }] = await Promise.all([
    ctx.supabase
      .from("pool_members")
      .select("user_id, role, paid, joined_at, profile:profiles!inner ( display_name )")
      .eq("pool_id", ctx.pool.id)
      .order("joined_at"),
    ctx.supabase.from("invites").select("token").eq("pool_id", ctx.pool.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // Sign-in emails, which only the commissioner may read (pool_member_emails checks).
    ctx.supabase.rpc("pool_member_emails", { p_pool_id: ctx.pool.id }),
  ]);
  if (emailError) console.error("Roster: member emails unavailable", emailError);
  const emailOf = new Map<string, string>((emails ?? []).map((e: { user_id: string; email: string }) => [e.user_id, e.email]));
  // Everyone's address in one line, for pasting into an email's To: field.
  const allEmails = (members ?? [])
    .map((m) => emailOf.get(m.user_id))
    .filter((e): e is string => Boolean(e))
    .join(", ");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = invite ? `${appUrl}/join/${invite.token}` : null;
  const fee = Number(ctx.pool.entry_fee);
  const paidCount = members?.filter((m) => m.paid).length ?? 0;

  return (
    <div className="space-y-8">
      <Panel className="p-4">
        <h2 className="mb-1 text-[15px] font-semibold">Invite link</h2>
        <p className="mb-3 text-sm text-muted">Anyone with this link can join. Text it to the group.</p>
        {link ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[10px] bg-bg px-3 py-2.5 font-sans text-sm text-muted">{link}</code>
            <CopyButton text={link} />
          </div>
        ) : (
          <p className="text-sm text-muted">No active link.</p>
        )}
        <form action={rotateInvite.bind(null, slug)} className="mt-1">
          <button className="-mx-1 inline-flex min-h-11 items-center px-1 text-sm text-muted hover:text-ink">
            {link ? "Replace link (the old one stops working)" : "Create a link"}
          </button>
        </form>
      </Panel>

      <section>
        <div className="flex items-baseline gap-2 border-b border-line pb-2">
          <SectionLabel>Members</SectionLabel>
          <span className="text-xs text-muted tabular-nums">
            {members?.length ?? 0}
            {fee > 0 && ` · ${paidCount} paid · $${(paidCount * fee).toFixed(0)} collected`}
          </span>
          {allEmails && (
            <span className="ml-auto">
              <CopyButton text={allEmails} label="Copy all emails" subtle />
            </span>
          )}
        </div>
        {/* Most likely the pool_member_emails migration hasn't reached the database yet. */}
        {emailError && (
          <p className="border-b border-line py-2 text-sm text-muted">Members&apos; emails can&apos;t be shown right now (the database needs its latest update).</p>
        )}
        <ul className="divide-y divide-line">
          {members?.map((m) => (
            <li key={m.user_id} className="flex min-h-14 items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">
                  {m.profile.display_name}
                  {m.role === "commissioner" && <span className="ml-1.5 text-xs font-normal text-muted">Commissioner</span>}
                </span>
                {emailOf.get(m.user_id) && (
                  <a href={`mailto:${emailOf.get(m.user_id)}`} className="block truncate text-sm text-muted hover:text-ink hover:underline">
                    {emailOf.get(m.user_id)}
                  </a>
                )}
              </span>
              <form action={setPaid.bind(null, slug, m.user_id, !m.paid)}>
                {/* Visible text is the accessible name (label-in-name); the title says what a tap does. */}
                <button
                  className={`inline-flex min-h-11 items-center gap-1 rounded-full bg-surface px-3.5 text-sm font-medium transition hover:bg-hover ${m.paid ? "text-win" : "text-muted"}`}
                  title={m.paid ? "Mark unpaid" : "Mark paid"}
                >
                  {m.paid && <CheckIcon className="size-4" />}
                  {m.paid ? "Paid" : "Unpaid"}
                </button>
              </form>
              {m.user_id !== ctx.user.id && (
                <form action={removeMember.bind(null, slug, m.user_id)}>
                  <Button kind="danger" className="!px-4 !text-sm">Remove</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
