import Link from "next/link";
import type { ReactNode } from "react";
import { LinkButton, Wordmark } from "@/components/ui";
import { PoolTypes } from "./PoolTypes";
import { Shots } from "./Shots";

// The page a signed-out visitor sees at the site's address: what it is, the pools it runs, how it
// works, a look at the pages, then start a pool or sign in. (Signed-in players go to My Pools.)

const START = "/login?next=%2Fpools%2Fnew";
const SIGN_IN = "/login";

const STEPS = [
  { title: "Start a pool", text: "Choose the sport and format, set the rules, and you're the commissioner." },
  { title: "Invite your people", text: "Share one link by text or email. Friends sign in with their email, no passwords." },
  { title: "Picks lock and grade themselves", text: "Picks lock when each game starts, scores come in live, and standings update the moment results are final." },
];

const FEATURES: { title: string; text: string }[] = [
  { title: "Live scores", text: "Scores and game status on every pick while games are on." },
  { title: "Automatic locks and grading", text: "Each pick locks when its game starts, and every result is graded for you." },
  { title: "League Grid", text: "Everyone's picks side by side, revealed as each game starts." },
  { title: "Weekly and season standings", text: "Week and season leaders, each player's pick history, and how the pool picked." },
  { title: "Works on any phone", text: "Built for picking on the go. Times show in each player's own time zone." },
  { title: "Co-managers and guests", text: "Let someone else run an entry, or add followers who can watch without playing." },
  { title: "Message board", text: "Trash talk and announcements stay with the pool." },
  { title: "Commissioner tools", text: "Publish slates, adjust a result, and manage the roster from one place." },
];

function Section({ label, title, children, className = "" }: { label: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-accent">{label}</div>
      <h2 className="mt-2 max-w-2xl text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">{title}</h2>
      <div className="mt-8 sm:mt-10">{children}</div>
    </section>
  );
}

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
        {/* Hero: the pitch and both ways in. */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:pb-20 lg:pt-24">
          <div>
            {/* Tagline to come; the site's name for now. */}
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-6xl">The Office Pool Hall</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Every pool your group runs, all in one place. Pick the sport, set your own scoring, locks and bonuses, and let the site
              handle the picks, scores and standings. No spreadsheets required.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={START} kind="accent" className="!h-12 !px-6">
                Start a pool
              </LinkButton>
              <LinkButton href={SIGN_IN} kind="secondary" className="!h-12 !px-6">
                Sign in
              </LinkButton>
            </div>
            <p className="mt-4 text-sm text-muted">Got an invite? Open the link from your commissioner to join their pool.</p>
          </div>
        </section>

        {/* The real pages, from a pool being played (players renamed). */}
        <div className="border-t border-line bg-surface/50">
          <Section label="A look inside" title="Everything the group argues about, in one place.">
            <Shots />
          </Section>
        </div>

        <div className="border-t border-line">
          <Section label="Pool types" title="Choose your sport, then your pool.">
            <PoolTypes />
          </Section>
        </div>

        <Section label="How it works" title="Set it up once. It runs itself all season.">
          <ol className="grid gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-2 border-accent pt-4">
                <div className="text-sm font-bold tabular-nums text-accent">0{i + 1}</div>
                <h3 className="mt-1 text-lg font-bold leading-tight">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>


        <Section label="Features" title="Built for commissioners and the people who play.">
          <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <h3 className="flex items-center gap-2 font-bold leading-tight">
                  <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-accent">
                    <path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {f.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </Section>

        <section className="border-t border-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold tracking-[-0.03em] sm:text-3xl">Ready to start?</h2>
              <p className="mt-1 text-muted">Start a pool in a couple of minutes, or sign in to get back to yours.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <LinkButton href={START} kind="accent" className="!h-12 !px-6">
                Start a pool
              </LinkButton>
              <LinkButton href={SIGN_IN} kind="secondary" className="!h-12 !px-6">
                Sign in
              </LinkButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted sm:px-6">
          <Wordmark className="text-[15px]" />
        </div>
      </footer>
    </div>
  );
}
