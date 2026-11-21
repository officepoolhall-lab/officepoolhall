import { CopyButton } from "@/components/CopyButton";
import { OnlineDot } from "@/components/PoolPresence";
import { Button, CheckIcon } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsUI";
import type { PoolBase } from "@/lib/pool";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { assignEntryEmail, assignEntryEmails, disableGuestInvite, removeGuest, removeMember, rotateGuestInvite, rotateInvite, setPaid } from "@/app/p/[slug]/admin/actions";

/**
 * The commissioner's roster, the same for every sport: the invite link, every entry with its
 * email (the one they sign in with), account status, co-managers and paid mark, and guests
 * with their own link.
 */
export async function AdminRoster({
  ctx,
  slug,
  timezone,
  embed,
}: {
  ctx: PoolBase;
  slug: string;
  timezone: string;
  /** The landing page's copy (an admin client, no signed-in commissioner): made-up names and
      emails, a sample invite link, the first few players, no guests, nothing that acts. */
  embed?: { rename: (userId: string) => string; maxRows: number };
}) {
  if (embed) return <RosterEmbed ctx={ctx} timezone={timezone} embed={embed} />;
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
    iso ? `Last signed in ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: timezone })}` : "Never signed in";
  // Imported entries (Splash) start with a placeholder address nobody can sign in with,
  // until the commissioner adds the owner's real email.
  const unclaimed = (id: string) => /\.invalid$/i.test(emailOf.get(id) ?? "");
  const unclaimedCount = (members ?? []).filter((m) => unclaimed(m.user_id)).length;
  // Everyone's address in one line, for pasting into an email's To: field.
  const allEmails = (members ?? [])
    .map((m) => emailOf.get(m.user_id))
    .filter((e): e is string => Boolean(e) && !/\.invalid$/i.test(e!))
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

  const stat = (label: string, value: string) => (
    <div className="rounded-2xl bg-surface px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums text-ink">{value}</div>
    </div>
  );
  const memberCount = members?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* The roster at a glance. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Players", String(memberCount))}
        {stat("Paid", fee > 0 ? `${paidCount} of ${memberCount}` : "No fee")}
        {stat("Collected", fee > 0 ? `$${(paidCount * fee).toFixed(0)}` : "—")}
        {stat("Accounts set up", accountOf.size > 0 ? `${setUpCount} of ${memberCount}` : "—")}
      </div>

      <SettingsSection title="Invite players" description="Anyone with this link can join the pool. Text or email it to the group.">
        <div className="py-3">
          {link ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[10px] bg-bg px-3 py-2.5 font-sans text-sm text-muted ring-1 ring-line">{link}</code>
              <CopyButton text={link} />
            </div>
          ) : (
            <p className="text-sm text-muted">No invite link yet.</p>
          )}
          <form action={rotateInvite.bind(null, slug)} className="mt-1">
            <button className="-mx-2 inline-flex min-h-10 items-center rounded-full px-2 text-sm font-medium text-muted hover:bg-hover hover:text-ink">
              {link ? "Make a new link (the old one stops working)" : "Create an invite link"}
            </button>
          </form>
        </div>
      </SettingsSection>

      <section className="rounded-2xl bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-[-0.01em] text-ink">Players</h2>
            <p className="mt-0.5 text-sm text-muted">Tap Paid or Unpaid to mark entry fees. Emails are only visible to you.</p>
          </div>
          {allEmails && (
            <span className="ml-auto">
              <CopyButton text={allEmails} label="Copy all emails" subtle />
            </span>
          )}
        </div>
        {/* Imported entries waiting for their owners: add many emails at once. */}
        {unclaimedCount > 0 && (
          <details className="border-b border-line py-2">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-accent">
              Add emails for imported entries
              <span className="font-normal text-muted">· {unclaimedCount} without an email</span>
            </summary>
            <ActionForm action={assignEntryEmails.bind(null, slug)} className="space-y-2 pb-2">
              <p className="text-sm text-muted">
                One entry per line: the name it shows here, the person&apos;s real name, and their email, separated by commas (or paste
                three columns from a spreadsheet). For example: <span className="font-mono text-xs text-ink">JP21, John Paulson, john@example.com</span>.
                A second entry is <span className="font-mono text-xs text-ink">JP21 (Entry 2)</span>. The real name can be left out.
              </p>
              <textarea
                name="lines"
                rows={8}
                className="w-full rounded-[10px] bg-bg p-3 font-mono text-xs outline-none ring-1 ring-line focus:ring-2 focus:ring-accent"
                placeholder={"JP21, John Paulson, john@example.com\nHaydenH, Hayden Hill, hayden@example.com"}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="send" defaultChecked className="size-4 accent-[var(--accent)]" />
                Email each person a sign-in link now
              </label>
              <SubmitButton pending="Adding…">Add emails</SubmitButton>
            </ActionForm>
          </details>
        )}
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
                {unclaimed(m.user_id) ? (
                  // Imported, no real email yet: add one here; they then sign in with it.
                  <details className="mt-0.5">
                    <summary className="inline-flex cursor-pointer items-center gap-2 text-xs">
                      <span className="font-semibold text-muted">Imported · no email yet</span>
                      <span className="font-semibold text-accent">Add email</span>
                    </summary>
                    <ActionForm action={assignEntryEmail.bind(null, slug, m.user_id)} className="mt-2 grid gap-2 pb-1 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
                      <input name="first_name" placeholder="First name" className="h-10 rounded-[10px] bg-bg px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent" />
                      <input name="last_name" placeholder="Last name" className="h-10 rounded-[10px] bg-bg px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent" />
                      <input name="email" type="email" required placeholder="Email" className="h-10 rounded-[10px] bg-bg px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent" />
                      <SubmitButton pending="Adding…" className="!h-10">Add</SubmitButton>
                      <label className="flex items-center gap-2 text-xs text-muted sm:col-span-4">
                        <input type="checkbox" name="send" defaultChecked className="size-4 accent-[var(--accent)]" />
                        Email them a sign-in link now
                      </label>
                    </ActionForm>
                  </details>
                ) : emailOf.get(m.user_id) && (
                  <a href={`mailto:${emailOf.get(m.user_id)}`} className="block truncate text-sm text-muted hover:text-ink -mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 transition hover:bg-hover">
                    {emailOf.get(m.user_id)}
                  </a>
                )}
                {/* Account status: password chosen and name confirmed = set up. */}
                {accountOf.get(m.user_id) && !unclaimed(m.user_id) && (
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
                    <a href={`mailto:${c.email}`} className="hover:text-ink -mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 transition hover:bg-hover">{c.email}</a>
                  </span>
                ))}
              </span>
              <form action={setPaid.bind(null, slug, m.user_id, !m.paid)}>
                {/* Visible text is the accessible name (label-in-name); the title says what a tap does. */}
                <button
                  className={`inline-flex min-h-10 items-center gap-1 rounded-full px-3.5 text-sm font-semibold ring-1 transition ${m.paid ? "bg-[var(--win-fill)] text-win ring-win/40" : "bg-bg text-muted ring-line hover:text-ink"}`}
                  title={m.paid ? "Mark unpaid" : "Mark paid"}
                >
                  {m.paid && <CheckIcon className="size-4" />}
                  {m.paid ? "Paid" : "Unpaid"}
                </button>
              </form>
              {m.user_id !== ctx.user.id && (
                <form action={removeMember.bind(null, slug, m.user_id)}>
                  <Button kind="danger" className="!h-10 !bg-bg !px-4 !text-sm ring-1 ring-line">Remove</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Guests: can view the whole pool but don't play, pick or post, and aren't in the standings. */}
      <section className="rounded-2xl bg-surface p-4 sm:p-5">
        <h2 className="text-base font-bold tracking-[-0.01em] text-ink">
          Guests <span className="text-sm font-normal text-muted tabular-nums">· {guests.length}</span>
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Guests can see everything (standings, the Grid, picks once games start, the message board) but can&apos;t make picks or post. Share this link to add one.
        </p>
        <div className="mt-3">
          {guestLink ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[10px] bg-bg px-3 py-2.5 font-sans text-sm text-muted ring-1 ring-line">{guestLink}</code>
              <CopyButton text={guestLink} />
            </div>
          ) : (
            <p className="text-sm text-muted">No guest link.</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-2">
            <form action={rotateGuestInvite.bind(null, slug)}>
              <button className="-mx-2 inline-flex min-h-10 items-center rounded-full px-2 text-sm font-medium text-muted hover:bg-hover hover:text-ink">
                {guestLink ? "Make a new link (the old one stops working)" : "Create a guest link"}
              </button>
            </form>
            {guestLink && (
              <form action={disableGuestInvite.bind(null, slug)}>
                <button className="-mx-2 inline-flex min-h-10 items-center rounded-full px-2 text-sm font-medium text-muted hover:bg-hover hover:text-ink">Turn off the link</button>
              </form>
            )}
          </div>
        </div>
        {guests.length > 0 && (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {guests.map((g) => (
              <li key={g.user_id} className="flex min-h-14 items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">
                    {g.display_name}
                    <span className="ml-1.5 text-xs font-normal text-muted">Guest</span>
                  </span>
                  <a href={`mailto:${g.email}`} className="block truncate text-sm text-muted hover:text-ink -mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 transition hover:bg-hover">{g.email}</a>
                  <span className="text-xs text-faint">{signedIn(g.last_sign_in_at)}</span>
                </span>
                <form action={removeGuest.bind(null, slug, g.user_id)}>
                  <Button kind="danger" className="!h-10 !bg-bg !px-4 !text-sm ring-1 ring-line">Remove</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The landing page's roster: the same layout, with nothing real that identifies anyone. */
async function RosterEmbed({ ctx, timezone, embed }: { ctx: PoolBase; timezone: string; embed: { rename: (userId: string) => string; maxRows: number } }) {
  const db = ctx.supabase;
  const { data: members } = await db.from("pool_members").select("user_id, role, paid").eq("pool_id", ctx.pool.id);
  const [{ data: profiles }, users] = await Promise.all([
    db.from("profiles").select("id, name_confirmed").in("id", (members ?? []).map((m) => m.user_id)),
    db.auth.admin.listUsers({ perPage: 1000 }).then(({ data }) => data?.users ?? []).catch(() => []),
  ]);
  const confirmed = new Set(((profiles ?? []) as { id: string; name_confirmed: boolean | null }[]).filter((p) => p.name_confirmed).map((p) => p.id));
  const userOf = new Map(users.map((u) => [u.id, u]));
  const all = (members ?? []) as { user_id: string; role: string; paid: boolean }[];
  const setUp = (id: string) => Boolean(userOf.get(id)?.user_metadata?.password_set && confirmed.has(id));
  const fee = Number(ctx.pool.entry_fee);
  const paidCount = all.filter((m) => m.paid).length;
  const rows = all
    .map((m) => ({ ...m, name: embed.rename(m.user_id) }))
    .sort((a, b) => (a.role === "commissioner" ? -1 : b.role === "commissioner" ? 1 : a.name.localeCompare(b.name)))
    .slice(0, embed.maxRows);
  const email = (name: string) => `${name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@email.com`;
  const signedIn = (iso: string | null | undefined) =>
    iso ? `Last signed in ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: timezone })}` : "Never signed in";
  const stat = (label: string, value: string) => (
    <div className="rounded-2xl bg-surface px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums text-ink">{value}</div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Players", String(all.length))}
        {stat("Paid", fee > 0 ? `${paidCount} of ${all.length}` : "No fee")}
        {stat("Collected", fee > 0 ? `$${(paidCount * fee).toFixed(0)}` : "—")}
        {stat("Accounts set up", users.length ? `${all.filter((m) => setUp(m.user_id)).length} of ${all.length}` : "—")}
      </div>
      <SettingsSection title="Invite players" description="Anyone with this link can join the pool. Text or email it to the group.">
        <div className="flex flex-wrap items-center gap-2 py-3">
          <code className="min-w-0 flex-1 truncate rounded-[10px] bg-bg px-3 py-2.5 font-sans text-sm text-muted ring-1 ring-line">officepoolhall.com/join/your-pool</code>
          <span className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white dark:text-black">Copy</span>
        </div>
      </SettingsSection>
      <section className="rounded-2xl bg-surface p-4 sm:p-5">
        <div className="border-b border-line pb-3">
          <h2 className="text-base font-bold tracking-[-0.01em] text-ink">Players</h2>
          <p className="mt-0.5 text-sm text-muted">Tap Paid or Unpaid to mark entry fees. Emails are only visible to you.</p>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((m) => {
            const u = userOf.get(m.user_id);
            return (
              <li key={m.user_id} className="flex min-h-14 items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">
                    {m.name}
                    {m.role === "commissioner" && <span className="ml-1.5 text-xs font-normal text-muted">Commissioner</span>}
                  </span>
                  <span className="block truncate text-sm text-muted">{email(m.name)}</span>
                  {u && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                      {setUp(m.user_id) ? (
                        <span className="inline-flex items-center gap-0.5 font-semibold text-win"><CheckIcon className="size-3.5" /> Account set up</span>
                      ) : (
                        <span className="font-semibold text-muted">Not set up yet</span>
                      )}
                      <span className="text-faint">{signedIn(u.last_sign_in_at)}</span>
                    </span>
                  )}
                </span>
                <span className={`inline-flex min-h-10 items-center gap-1 rounded-full px-3.5 text-sm font-semibold ring-1 ${m.paid ? "bg-[var(--win-fill)] text-win ring-win/40" : "bg-bg text-muted ring-line"}`}>
                  {m.paid && <CheckIcon className="size-4" />}
                  {m.paid ? "Paid" : "Unpaid"}
                </span>
              </li>
            );
          })}
        </ul>
        {all.length > rows.length && <p className="pt-3 text-sm text-muted">+ {all.length - rows.length} more players</p>}
      </section>
    </div>
  );
}
