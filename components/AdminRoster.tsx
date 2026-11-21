import { CopyButton } from "@/components/CopyButton";
import { OnlineDot } from "@/components/PoolPresence";
import { Button, CheckIcon } from "@/components/ui";
import { SettingsSection } from "@/components/SettingsUI";
import type { PoolBase } from "@/lib/pool";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { RosterNote } from "@/components/RosterNote";
import { RosterActions } from "@/components/RosterActions";
import { getBenchedIds } from "@/lib/bench";
import { assignEntryEmail, assignEntryEmails, disableGuestInvite, removeGuest, removeMember, benchMember, unbenchMember, rotateGuestInvite, rotateInvite, setMemberNote, setPaid } from "@/app/p/[slug]/admin/actions";

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
  // The commissioner's private notes (none until the notes migration is in).
  const { data: noteRows } = await ctx.supabase.from("pool_member_notes").select("user_id, note").eq("pool_id", ctx.pool.id);
  const noteOf = new Map(((noteRows ?? []) as { user_id: string; note: string }[]).map((n) => [n.user_id, n.note]));
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
  const joined = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: timezone });
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
  const benched = await getBenchedIds(ctx.supabase, ctx.pool.id);
  const paidCount = members?.filter((m) => m.paid && !benched.has(m.user_id)).length ?? 0;
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
  const memberCount = (members ?? []).filter((m) => !benched.has(m.user_id)).length;

  const active = byName.filter((m) => !benched.has(m.user_id));
  const benchedRows = byName.filter((m) => benched.has(m.user_id));
  const renderRow = (m: (typeof byName)[number]) => (
            <li key={m.user_id} className={ROW}>
              {/* Name, with who's online, the commissioner tag and any co-managers. */}
              <div className={`${CELL.name} min-w-0`}>
                <span className="block truncate text-[15px] font-medium">
                  {m.profile.display_name}
                  {/* Green when they're on the site right now (components/PoolPresence). */}
                  <OnlineDot userId={m.user_id} className="ml-1.5 align-middle" />
                  {m.role === "commissioner" && <span className="ml-1.5 text-xs font-normal text-muted">Commissioner</span>}
                </span>
                {/* People this player invited to help run their entry. */}
                {(comanagersOf.get(m.user_id) ?? []).map((c) => (
                  <span key={c.manager_id} className="block truncate text-xs text-muted" title={c.email}>
                    <span className="font-semibold">Co-manager:</span> {c.manager_name}
                    <OnlineDot userId={c.manager_id} className="ml-1 align-middle" />
                  </span>
                ))}
              </div>

              <div className={`${CELL.email} min-w-0`}>
                {unclaimed(m.user_id) ? (
                  // Imported, no real email yet: add one here; they then sign in with it.
                  <details>
                    <summary className="inline-flex cursor-pointer items-center gap-2 text-sm">
                      <span className="text-muted">No email yet</span>
                      <span className="font-semibold text-accent">Add email</span>
                    </summary>
                    <ActionForm action={assignEntryEmail.bind(null, slug, m.user_id)} className="mt-2 grid gap-2 pb-1">
                      <input name="first_name" placeholder="First name" className="h-10 rounded-[10px] bg-bg px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent" />
                      <input name="last_name" placeholder="Last name" className="h-10 rounded-[10px] bg-bg px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent" />
                      <input name="email" type="email" required placeholder="Email" className="h-10 rounded-[10px] bg-bg px-3 text-sm outline-none ring-1 ring-line focus:ring-2 focus:ring-accent" />
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" name="send" defaultChecked className="size-4 accent-[var(--accent)]" />
                        Email them a sign-in link now
                      </label>
                      <SubmitButton pending="Adding…" className="!h-10">Add</SubmitButton>
                    </ActionForm>
                  </details>
                ) : emailOf.get(m.user_id) ? (
                  <a href={`mailto:${emailOf.get(m.user_id)}`} className="-mx-1.5 -my-0.5 block truncate rounded-md px-1.5 py-0.5 text-sm text-muted transition hover:bg-hover hover:text-ink">
                    {emailOf.get(m.user_id)}
                  </a>
                ) : (
                  <span className="text-sm text-faint">—</span>
                )}
              </div>

              <div className={CELL.joined}>
                <span className="sm:hidden">Joined </span>
                {joined(m.joined_at)}
              </div>

              <form action={setPaid.bind(null, slug, m.user_id, !m.paid)} className={CELL.paid}>
                {/* Visible text is the accessible name (label-in-name); the title says what a tap does. */}
                <PaidMark paid={m.paid} button />
              </form>

              <div className={CELL.notes}>
                <RosterNote initial={noteOf.get(m.user_id) ?? ""} save={setMemberNote.bind(null, slug, m.user_id)} label={`Notes on ${m.profile.display_name}`} />
              </div>

              <div className={CELL.remove}>
                {m.user_id !== ctx.user.id && (
                  <RosterActions
                    name={m.profile.display_name}
                    benched={benched.has(m.user_id)}
                    bench={benchMember.bind(null, slug, m.user_id)}
                    unbench={unbenchMember.bind(null, slug, m.user_id)}
                    remove={removeMember.bind(null, slug, m.user_id)}
                  />
                )}
              </div>
            </li>  );

  return (
    <div className="space-y-4">
      {/* The roster at a glance. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Players", String(memberCount))}
        {stat("Paid", fee > 0 ? `${paidCount} of ${memberCount}` : "No fee")}
        {stat("Collected", fee > 0 ? `$${(paidCount * fee).toFixed(0)}` : "—")}
        {stat("Benched", String(benched.size))}
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
            <p className="mt-0.5 text-sm text-muted">Tap Paid or Unpaid to mark entry fees. Emails and notes are only visible to you.</p>
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
        <RosterHeader />
        <ul className="divide-y divide-line">
          {active.map(renderRow)}
        </ul>
        {/* Sitting out: kept here, out of the standings and the counts above, no picks. */}
        {benchedRows.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <h3 className="text-sm font-bold text-ink">
              Benched <span className="font-normal text-muted tabular-nums">· {benchedRows.length}</span>
            </h3>
            <p className="mt-0.5 text-sm text-muted">Sitting out: not in the standings or the Grid, and can&apos;t make picks. Bring them back any time from the ⋯ menu.</p>
            <ul className="mt-1 divide-y divide-line opacity-80">{benchedRows.map(renderRow)}</ul>
          </div>
        )}
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
  const benched = await getBenchedIds(db, ctx.pool.id);
  const all = ((members ?? []) as { user_id: string; role: string; paid: boolean; joined_at: string }[]).filter((m) => !benched.has(m.user_id));
  const joined = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: timezone });
  const fee = Number(ctx.pool.entry_fee);
  const paidCount = all.filter((m) => m.paid).length;
  const rows = all
    .map((m) => ({ ...m, name: embed.rename(m.user_id) }))
    .sort((a, b) => (a.role === "commissioner" ? -1 : b.role === "commissioner" ? 1 : a.name.localeCompare(b.name)))
    .slice(0, embed.maxRows);
  const email = (name: string) => `${name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@email.com`;
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
        {stat("Benched", String(benched.size))}
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
          <p className="mt-0.5 text-sm text-muted">Tap Paid or Unpaid to mark entry fees. Emails and notes are only visible to you.</p>
        </div>
        <RosterHeader />
        <ul className="divide-y divide-line">
          {rows.map((m, k) => (
            <li key={m.user_id} className={ROW}>
              <div className={`${CELL.name} min-w-0`}>
                <span className="block truncate text-[15px] font-medium">
                  {m.name}
                  {m.role === "commissioner" && <span className="ml-1.5 text-xs font-normal text-muted">Commissioner</span>}
                </span>
              </div>
              <div className={`${CELL.email} min-w-0 truncate text-sm text-muted`}>{email(m.name)}</div>
              <div className={CELL.joined}>
                <span className="sm:hidden">Joined </span>
                {joined(m.joined_at)}
              </div>
              <div className={CELL.paid}>
                <PaidMark paid={m.paid} />
              </div>
              <div className={CELL.notes}>
                {/* Sample notes (a commissioner's real ones are private). */}
                <div className={`flex h-10 items-center truncate rounded-[10px] bg-bg px-3 text-sm ring-1 ring-line ${SAMPLE_NOTES[k % SAMPLE_NOTES.length] ? "text-ink" : "text-faint"}`}>
                  {SAMPLE_NOTES[k % SAMPLE_NOTES.length] || "Add a note"}
                </div>
              </div>
              <div className={CELL.remove}>
                {m.role !== "commissioner" && (
                  <span className="flex size-10 items-center justify-center text-muted">
                    <DotsIcon />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        {all.length > rows.length && <p className="pt-3 text-sm text-muted">+ {all.length - rows.length} more players</p>}
      </section>
    </div>
  );
}

/**
 * One player per row: Name · Email · Joined · Paid · Notes, and remove at the end. On phones
 * the name and paid mark share the top line, then the email, the joined date (with remove), and the note.
 */
const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_7rem_6.5rem_minmax(0,1.6fr)_2.5rem] sm:gap-x-4 sm:py-2";
const CELL = {
  name: "col-start-1 row-start-1 sm:col-start-auto sm:row-start-auto",
  paid: "col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto sm:justify-self-start",
  email: "col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto",
  remove: "col-start-2 row-start-3 -my-2 justify-self-end sm:col-start-auto sm:row-start-auto sm:my-0",
  joined: "col-start-1 row-start-3 text-sm tabular-nums text-muted sm:col-start-auto sm:row-start-auto",
  notes: "col-span-2 row-start-4 sm:col-span-1 sm:row-start-auto",
};

function RosterHeader() {
  return (
    <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_7rem_6.5rem_minmax(0,1.6fr)_2.5rem] gap-x-4 border-b border-line py-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
      <span>Name</span>
      <span>Email</span>
      <span>Joined</span>
      <span>Paid</span>
      <span>Notes</span>
      <span />
    </div>
  );
}

function PaidMark({ paid, button = false }: { paid: boolean; button?: boolean }) {
  const cls = `inline-flex min-h-10 items-center gap-1 rounded-full px-3.5 text-sm font-semibold ring-1 transition ${
    paid ? "bg-[var(--win-fill)] text-win ring-win/40" : `bg-bg text-muted ring-line ${button ? "hover:text-ink" : ""}`
  }`;
  const body = (
    <>
      {paid && <CheckIcon className="size-4" />}
      {paid ? "Paid" : "Unpaid"}
    </>
  );
  return button ? (
    <button className={cls} title={paid ? "Mark unpaid" : "Mark paid"}>
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
}

function DotsIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="size-5">
      <circle cx="4.5" cy="10" r="1.6" fill="currentColor" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
      <circle cx="15.5" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}

const SAMPLE_NOTES = ["Paid by Venmo", "", "Pays cash at lunch", "Owes $25", "", "Second entry next year"];
