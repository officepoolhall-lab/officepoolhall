import Link from "next/link";
import type { ReactNode } from "react";
import { LinkButton, Wordmark } from "@/components/ui";
import { LEAGUES } from "@/lib/poolCatalog";
import { poolTypeHref } from "@/lib/poolGuides";
import { Shots } from "./Shots";

// The page a signed-out visitor sees at the site's address, written for commissioners and kept
// short: the pitch, the real pages as slides (from a pool being played, players renamed),
// real-person support, then start a pool or sign in. Signed-in players go straight to My
// Pools.

export const START = "/login?next=%2Fpools%2Fnew";
export const SIGN_IN = "/login";

/** The four promises beside the headline. */
const PROMISES: { title: string; text: ReactNode }[] = [
  {
    title: "Your Group, Not Ours",
    text: "You joined our site to host your pool, not to be advertised to. Emails are only visible to you. They are not a list for us to cross-sell.",
  },
  { title: "Live Scoring", text: "No need for any other website or app. Live scoring, stats and play-by-play available all in one space." },
  { title: "Every Sport, One Space", text: "All of your pools consolidated into one space. All sports, all types." },
  {
    title: "Your Rules",
    text: (
      <>
        Sport, pool type, scoring, tiebreakers, and deadlines set the way your group plays. Need additional customization?{" "}
        <a href="#support" className="font-semibold text-accent hover:underline">
          Reach out to our creators directly
        </a>{" "}
        for help with building your pool.
      </>
    ),
  },
];

const SUPPORT = [
  { title: "Getting set up", text: "Help choosing a format, setting the rules and inviting your group." },
  { title: "Mid-season fixes", text: "A missed pick, a postponed game, a rule your group wants changed." },
  { title: "Ideas for the site", text: "Features get added because commissioners ask for them." },
];


function Section({ label, title, children, className = "", oneLine = false }: { label: string; title: string; children: ReactNode; className?: string; oneLine?: boolean }) {
  return (
    <section className={`mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-14 ${className}`}>
      <div className="text-sm font-bold uppercase tracking-wide text-accent sm:text-base">{label}</div>
      <h2 className={`mt-2 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl ${oneLine ? "lg:whitespace-nowrap" : "max-w-2xl"}`}>{title}</h2>
      <div className="mt-6 sm:mt-8">{children}</div>
    </section>
  );
}

const Check = () => (
  <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-accent">
    <path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Landing() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />

      <main className="flex-1">
        {/* Hero: for commissioners. The pitch and both ways in, with four promises beside it. */}
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-12 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16 lg:pb-14 lg:pt-16">
          <div>
            <div className="text-sm font-bold uppercase tracking-wide text-accent sm:text-base">Built by a commissioner, for commissioners.</div>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-6xl">Say goodbye to the spreadsheets.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">All your pools in one customizable, zero-hassle space.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={START} kind="accent" className="!h-12 !px-6">
                Start your pool →
              </LinkButton>
              <LinkButton href={SIGN_IN} kind="secondary" className="!h-12 !px-6">
                Sign in
              </LinkButton>
            </div>
            <p className="mt-4 text-sm text-muted">Got an invite? Open the link from your commissioner to join their pool.</p>
          </div>
          <ul className="grid gap-4 self-center sm:grid-cols-2 lg:grid-cols-1">
            {PROMISES.map((p) => (
              <li key={p.title} className="flex gap-3">
                <Check />
                <div>
                  <div className="font-bold leading-tight">{p.title}</div>
                  <p className="mt-0.5 text-sm text-muted">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* The real pages, one slide at a time. */}
        <div className="border-t border-line bg-surface/50">
          <Section label="What your pool looks like" title="Everything the group argues about, in one place." oneLine>
            <Shots />
          </Section>
        </div>

        {/* Support: a real person, the one who built it. */}
        <div id="support" className="scroll-mt-16 border-y border-line bg-surface/50">
          <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-accent">Support</div>
              <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">Talk to a real person.</h2>
              <p className="mt-3 max-w-md text-muted">
                No chatbot and no ticket queue. When you need a hand, you're connected with the commissioner who built the site, someone who runs these pools every week
                and knows what a Sunday-morning problem feels like.
              </p>
            </div>
            <ul className="grid gap-3 self-center sm:grid-cols-3 lg:grid-cols-1">
              {SUPPORT.map((x) => (
                <li key={x.title} className="flex gap-3 rounded-2xl bg-bg p-4 ring-1 ring-line">
                  <Check />
                  <div>
                    <div className="font-bold leading-tight">{x.title}</div>
                    <p className="mt-0.5 text-sm text-muted">{x.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Pricing: the options are still being set, so this says so for now. */}
        <section id="pricing" className="scroll-mt-16 border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
            <div className="text-sm font-bold uppercase tracking-wide text-accent sm:text-base">Pricing</div>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">Pricing options</h2>
            <div className="mt-6 rounded-2xl bg-surface p-6 ring-1 ring-line sm:mt-8 sm:p-8">
              <p className="text-lg font-bold">Pricing options are coming soon.</p>
              <p className="mt-2 max-w-2xl text-muted">
                Plans for every size of pool, from a group of friends to an office or a bar with hundreds of entries, will be posted here. Questions in the meantime?{" "}
                <a href="#support" className="font-semibold text-accent hover:underline">
                  Reach out to our creators directly
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">Ready to start?</h2>
              <p className="mt-1 text-muted">For offices, bars, friends, family and more. Create a pool in minutes.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <LinkButton href={START} kind="accent" className="!h-12 !px-6">
                Start your pool →
              </LinkButton>
              <LinkButton href={SIGN_IN} kind="secondary" className="!h-12 !px-6">
                Sign in
              </LinkButton>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

/** The site's public header (the landing page and the pool-type pages). */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex h-11 items-center text-ink">
            <Wordmark className="text-[19px]" />
          </Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link href={SIGN_IN} className="flex h-11 items-center rounded-full px-3 text-sm font-semibold text-muted hover:bg-surface hover:text-ink">
              Sign in
            </Link>
            <LinkButton href={START} kind="accent" className="!h-9 !px-4 !text-sm">
              Start a pool
            </LinkButton>
          </nav>
        </div>
    </header>
  );
}

/** The footer's sports, most popular first (each lists its pool types in the catalog's order). */
const FOOTER_ORDER = ["nfl", "pga", "ncaaf", "ncaab"] as const;

/** The site's public footer: every sport with its pool types, each linking to its page. */
export function LandingFooter() {
  return (
    <footer className="border-t border-line bg-surface/50">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-4 py-8 sm:px-6 md:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
        <div className="col-span-2 md:col-span-1">
          <Wordmark className="text-[17px]" />
          <p className="mt-2 max-w-xs text-sm text-muted">Built by a commissioner, for commissioners.</p>
        </div>
        {FOOTER_ORDER.map((id) => LEAGUES.find((l) => l.id === id)!).map((league) => (
          <div key={league.id}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{league.label}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {league.types.map((t) => (
                <li key={t.id}>
                  <Link href={poolTypeHref(league.id, t.id)} className="-mx-1.5 rounded-md px-1.5 py-0.5 font-medium text-ink hover:bg-hover">
                    {t.name}
                  </Link>
                  {!t.live && <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Soon</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto w-full max-w-6xl border-t border-line px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-muted sm:px-6">
        © 2026 The Office Pool Hall
      </div>
    </footer>
  );
}
