import Link from "next/link";
import type { ReactNode } from "react";
import { LinkButton, Wordmark } from "@/components/ui";
import { Shots } from "./Shots";

// The page a signed-out visitor sees at the site's address, written for commissioners and kept
// short: the pitch, the real pages as slides (from a pool being played, players renamed), how it
// works, real-person support, then start a pool or sign in. Signed-in players go straight to My
// Pools.

const START = "/login?next=%2Fpools%2Fnew";
const SIGN_IN = "/login";

/** The four promises beside the headline. */
const PROMISES = [
  { title: "Your rules", text: "Scoring, locks, bonuses and deadlines set the way your group plays." },
  { title: "Every sport, one place", text: "Football, basketball and golf pools side by side under one sign-in." },
  { title: "Live on every pick", text: "Scores update right next to each pick while games are on." },
  { title: "Your group stays yours", text: "No ads, and your players' emails are only visible to you." },
];

const STEPS = [
  { title: "Start a pool", text: "Pick the sport and format, set your rules, and you're the commissioner." },
  { title: "Invite your group", text: "Share one link by text or email. Players create an account and they're in." },
  { title: "Let it run", text: "Picks lock as games start, scores update live, and standings take care of themselves." },
];

const SUPPORT = [
  { title: "Getting set up", text: "Help choosing a format, setting the rules and inviting your group." },
  { title: "Mid-season fixes", text: "A missed pick, a postponed game, a rule your group wants changed." },
  { title: "Ideas for the site", text: "Features get added because commissioners ask for them." },
];

const FORMATS = ["Supercontest", "Pick'em", "Confidence", "NCAA Pick X", "PGA One-and-Done", "PGA Majors and tournaments"];

function Section({ label, title, children, className = "" }: { label: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-14 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-accent">{label}</div>
      <h2 className="mt-2 max-w-2xl text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">{title}</h2>
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

      <main className="flex-1">
        {/* Hero: for commissioners. The pitch and both ways in, with four promises beside it. */}
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-12 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16 lg:pb-14 lg:pt-16">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Built by a commissioner, for commissioners</div>
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
          <Section label="What your pool looks like" title="Everything the group argues about, in one place.">
            <Shots />
          </Section>
        </div>

        <Section label="How it works" title="Your pool, ready in one sitting.">
          <ol className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-2 border-accent pt-3">
                <div className="text-sm font-bold tabular-nums text-accent">0{i + 1}</div>
                <h3 className="mt-1 text-lg font-bold leading-tight">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-muted">
            <span className="font-semibold text-ink">Pools you can run today:</span> {FORMATS.join(" · ")}.
          </p>
        </Section>

        {/* Support: a real person, the one who built it. */}
        <div className="border-y border-line bg-surface/50">
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

        <section>
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">Ready to start?</h2>
              <p className="mt-1 text-muted">For offices, bars and clubs, and friends and family. Start a pool in a couple of minutes.</p>
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

      <footer className="border-t border-line bg-surface/50">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <Wordmark className="text-[17px]" />
            <p className="mt-2 max-w-xs text-sm text-muted">Built by a commissioner, for commissioners.</p>
          </div>
          <FooterColumn title="Football" items={["NFL Supercontest", "NFL Pick'em", "NFL Confidence", "College football pools"]} />
          <FooterColumn title="Basketball and golf" items={["College basketball pools", "NCAA Pick X", "PGA One-and-Done", "PGA Majors and tournaments"]} />
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Get started</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href={START} className="-mx-1.5 rounded-md px-1.5 py-0.5 font-medium text-ink hover:bg-hover">Start a pool</Link>
              </li>
              <li>
                <Link href={SIGN_IN} className="-mx-1.5 rounded-md px-1.5 py-0.5 font-medium text-ink hover:bg-hover">Sign in</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl border-t border-line px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-muted sm:px-6">
          © 2026 The Office Pool Hall
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm text-ink">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
