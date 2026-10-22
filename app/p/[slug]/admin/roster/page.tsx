import type { Metadata } from "next";
import { CopyButton } from "@/components/CopyButton";
import { OnlineDot } from "@/components/PoolPresence";
import { Button, CheckIcon, Panel, SectionLabel } from "@/components/ui";
import { requireCommissioner } from "@/lib/pool";
import { disableGuestInvite, removeGuest, removeMember, rotateGuestInvite, rotateInvite, setPaid } from "../actions";

export const metadata: Metadata = { title: "Roster" };

export default async function RosterPage({ params }: PageProps<"/p/[slug]/admin/roster">) {
  const { slug } = await params;
  const ctx = await requireCommissioner(slug);
  const [{ data: members }, { data: invite }, { data: accounts, error: accountsError }, { data: comanagers }, { data: guestInvite }, { data: guestRows }] = await Promise.all([
    ctx.supabase
      .from("pool_members")
      .select("user_id, role, paid, joined_at, profile:profiles!inner ( display_name )")
      .eq("pool_id", ctx.pool.id)
      .order("joined_at"),
    ctx.supabase.from("invites").select("token").eq("pool_id", ctx.pool.id).eq("guest", false).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    // Emails and account status, which only the commissioner may read (the function checks).
    ctx.supabase.rpc("pool_member_accounts", { p_pool_id: ctx.pool.id }),
    // Each entry's co-managers with their emails (none until that migration is in).
    ctx.supabase.rpc("pool_comanagers", { p_pool_id: ctx.pool.id }),
    // Guests: view-only people, with their own link.
    ctx.supabase.from("invites").select("token").eq("pool_id", ctx.pool.id).eq("guest", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.supabase.rpc("pool_guest_accounts", { p_pool_id: ctx.pool.id }),
  ]);
  const guests = (guestRows ?? []) as { user_id: string; display_name: string; email: string; last_sign_in_at: string | null }[];
  const comanagersOf = new Map<string, { manager_id: string; manager_name: string; email: string }[]>();
  for (const c of (comanagers ?? []) as { owner_id: string; manager_id: string; manager_name: string; email: string }[]) {
    comanagersOf.set(c.owner_id, [...(comanagersOf.get(c.owner_id) ?? []), c]);
  }
  // Until the account-status migration reaches the database, fall back to emails alone.
  let emailRows: { user_id: string; email: string }[] = accounts ?? [];
  let emailFailed = false;
  if (accountsError) {
    console.error("Roster: member accounts unavailable", accountsError);
    const { data: emails, error } = await ctx.supabase.rpc("pool_member_emails", { p_pool_id: ctx.pool.id });
    emailRows = emails ?? [];
    emailFailed = Boolean(error);
    if (error) console.error("Roster: member emails unavailable", error);
  }
  const emailOf = new Map<string, string>(emailRows.map((e: { user_id: string; email: string }) => [e.user_id, e.email]));
  type Account = { password_set: boolean; name_confirmed: boolean; last_sign_in_at: string | null };
  const accountOf = new Map<string, Account>(
    (accounts ?? []).map((a: Account & { user_id: string }) => [a.user_id, a]),
  );
  // "Set up": they chose a password and confirmed their name.
  const setUp = (id: string) => {
    const a = accountOf.get(id);
    return Boolean(a?.password_set && a.name_confirmed);
  };
  const setUpCount = (members ?? []).filter((m) => setUp(m.user_id)).length;
  const signedIn = (iso: string | null) =>
    iso ? `Last signed in ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ctx.settings.timezone })}` : "Never signed in";
  // Everyone's address in one line, for pasting into an email's To: field.
  const allEmails = (members ?? [])
    .map((m) => emailOf.get(m.user_id))
    .filter((e): e is string => Boolean(e))
    .join(", ");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = invite ? `${appUrl}/join/${invite.token}` : null;
  const guestLink = guestInvite ? `${appUrl}/join/${guestInvite.token}` : null;
  const fee = Number(ctx.pool.entry_fee);
  const paidCount = members?.filter((m) => m.paid).length ?? 0;
  // Alphabetical by name as shown ("First Last"), ignoring case and accents.
  const byName = [...(members ?? [])].sort((a, b) =>
    a.profile.display_name.localeCompare(b.profile.display_name, "en", { sensitivity: "base" }),
  );

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
            {accountOf.size > 0 && ` · ${setUpCount} set up`}
          </span>
          {allEmails && (
            <span className="ml-auto">
              <CopyButton text={allEmails} label="Copy all emails" subtle />
            </span>
          )}
        </div>
        {/* Most likely the pool_member_emails migration hasn't reached the database yet. */}
        {emailFailed && (
          <p className="border-b border-line py-2 text-sm text-muted">Members&apos; emails can&apos;t be shown right now (the database needs its latest update).</p>
        )}
        <ul className="divide-y divide-line">
          {byName.map((m) => (
            <li key={m.user_id} className="flex min-h-14 items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">
                  {m.profile.display_name}
                  {/* Green when they're on the site right now (components/PoolPresence). */}
                  <OnlineDot userId={m.user_id} className="ml-1.5 align-middle" />
                  {m.role === "commissioner" && <span className="ml-1.5 text-xs font-normal text-muted">Commissioner</span>}
                </span>
                {emailOf.get(m.user_id) && (
                  <a href={`mailto:${emailOf.get(m.user_id)}`} className="block truncate text-sm text-muted hover:text-ink hover:underline">
                    {emailOf.get(m.user_id)}
                  </a>
                )}
                {/* Account status: password chosen and name confirmed = set up. */}
                {accountOf.get(m.user_id) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    {setUp(m.user_id) ? (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-win">
                        <CheckIcon className="size-3.5" /> Account set up
                      </span>
                    ) : (
                      <span className="font-semibold text-muted">
                        {[
                          !accountOf.get(m.user_id)!.password_set && "No password yet",
                          !accountOf.get(m.user_id)!.name_confirmed && "Name not confirmed",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                    <span className="text-faint">{signedIn(accountOf.get(m.user_id)!.last_sign_in_at)}</span>
                  </span>
                )}
                {/* People this player invited to help run their entry. */}
                {(comanagersOf.get(m.user_id) ?? []).map((c) => (
                  <span key={c.manager_id} className="mt-0.5 block truncate text-xs text-muted">
                    <span className="font-semibold">Co-manager:</span> {c.manager_name}
                    <OnlineDot userId={c.manager_id} className="mx-1 align-middle" /> ·{" "}
                    <a href={`mailto:${c.email}`} className="hover:text-ink hover:underline">{c.email}</a>
                  </span>
                ))}
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

      {/* Guests: can view the whole pool but don't play, pick or post, and aren't in the standings. */}
      <section>
        <div className="flex items-baseline gap-2 border-b border-line pb-2">
          <SectionLabel>Guests</SectionLabel>
          <span className="text-xs text-muted tabular-nums">{guests.length} · view only</span>
        </div>
        <Panel className="mt-3 p-4">
          <h2 className="mb-1 text-[15px] font-semibold">Guest link</h2>
          <p className="mb-3 text-sm text-muted">
            Anyone who signs in with this link can see everything in the pool (standings, the Grid, picks once games start, the message board) but can&apos;t make picks or post.
          </p>
          {guestLink ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[10px] bg-bg px-3 py-2.5 font-sans text-sm text-muted">{guestLink}</code>
              <CopyButton text={guestLink} />
            </div>
          ) : (
            <p className="text-sm text-muted">No guest link.</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-4">
            <form action={rotateGuestInvite.bind(null, slug)}>
              <button className="-mx-1 inline-flex min-h-11 items-center px-1 text-sm text-muted hover:text-ink">
                {guestLink ? "Replace link (the old one stops working)" : "Create a guest link"}
              </button>
            </form>
            {guestLink && (
              <form action={disableGuestInvite.bind(null, slug)}>
                <button className="-mx-1 inline-flex min-h-11 items-center px-1 text-sm text-muted hover:text-ink">Turn off link</button>
              </form>
            )}
          </div>
        </Panel>
        {guests.length > 0 && (
          <ul className="mt-2 divide-y divide-line">
            {guests.map((g) => (
              <li key={g.user_id} className="flex min-h-14 items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">
                    {g.display_name}
                    <span className="ml-1.5 text-xs font-normal text-muted">Guest</span>
                  </span>
                  <a href={`mailto:${g.email}`} className="block truncate text-sm text-muted hover:text-ink hover:underline">{g.email}</a>
                  <span className="text-xs text-faint">{signedIn(g.last_sign_in_at)}</span>
                </span>
                <form action={removeGuest.bind(null, slug, g.user_id)}>
                  <Button kind="danger" className="!px-4 !text-sm">Remove</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
