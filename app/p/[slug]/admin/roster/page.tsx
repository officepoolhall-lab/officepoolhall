import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { Button, Card } from "@/components/ui";
import { requireCommissioner } from "@/lib/pool";
import { removeMember, rotateInvite, setPaid } from "../actions";

export const metadata: Metadata = { title: "Roster" };

export default async function RosterPage({ params }: PageProps<"/p/[slug]/admin/roster">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  const [{ data: members }, { data: invite }] = await Promise.all([
    ctx.supabase
      .from("pool_members")
      .select("user_id, role, paid, joined_at, profile:profiles!inner ( display_name )")
      .eq("pool_id", ctx.pool.id)
      .order("joined_at"),
    ctx.supabase.from("invites").select("token").eq("pool_id", ctx.pool.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = invite ? `${appUrl}/join/${invite.token}` : null;
  const fee = Number(ctx.pool.entry_fee);
  const paidCount = members?.filter((m) => m.paid).length ?? 0;

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-1 font-display text-xl font-bold uppercase">Invite link</h2>
        <p className="mb-3 text-sm text-muted">Anyone with this link can join. Text it to the group.</p>
        {link ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-raised px-3 py-2.5 text-sm">{link}</code>
            <CopyButton text={link} />
          </div>
        ) : (
          <p className="text-sm text-muted">No active link.</p>
        )}
        <form action={rotateInvite.bind(null, slug)} className="mt-2">
          <button className="text-sm text-muted underline">{link ? "Replace link (the old one stops working)" : "Create a link"}</button>
        </form>
      </Card>

      <Card>
        <div className="flex items-baseline gap-2 border-b border-border px-4 py-2">
          <h2 className="font-display text-xl font-bold uppercase">Members</h2>
          <span className="text-sm text-muted">
            {members?.length ?? 0}
            {fee > 0 && ` · ${paidCount} paid · $${(paidCount * fee).toFixed(0)} collected`}
          </span>
        </div>
        <ul className="divide-y divide-border">
          {members?.map((m) => (
            <li key={m.user_id} className="flex min-h-12 items-center gap-3 px-4 py-1.5">
              <span className="min-w-0 flex-1 truncate">
                {m.profile.display_name}
                {m.role === "commissioner" && <span className="ml-1.5 text-xs text-muted">commissioner</span>}
              </span>
              <form action={setPaid.bind(null, slug, m.user_id, !m.paid)}>
                <button
                  className={`min-h-9 rounded-full px-3 font-display text-sm font-semibold uppercase ${m.paid ? "bg-win/15 text-win" : "bg-raised text-muted"}`}
                  aria-label={m.paid ? "Mark unpaid" : "Mark paid"}
                >
                  {m.paid ? "Paid" : "Unpaid"}
                </button>
              </form>
              {m.user_id !== ctx.user.id && (
                <form action={removeMember.bind(null, slug, m.user_id)}>
                  <Button kind="danger" className="!min-h-9 !px-3 text-sm">Remove</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
