import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter, LandingHeader, LEAGUE_ORDER } from "@/components/landing/Landing";
import { LEAGUES } from "@/lib/poolCatalog";
import { poolTypeHref } from "@/lib/poolGuides";

// Where every "Start a pool" button lands: the sports and their pool types, open to anyone
// (no account needed to look around). Each card opens the type's own rules page, which is
// where sign-in starts.

export const metadata: Metadata = {
  title: "Start a pool",
  description: "Every sport and pool type the Office Pool Hall runs: pick your sport, then your pool, and see its rules before you sign in.",
};

export default function FormatsPage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="text-sm font-bold uppercase tracking-wide text-accent sm:text-base">Start a pool</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">Pick your sport, then your pool.</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Every pool type below lays out its rules, scoring and options — look around first, sign in when you&apos;re ready to start one.
        </p>

        {LEAGUE_ORDER.map((id) => LEAGUES.find((l) => l.id === id)!).map((league) => (
          <section key={league.id} className="mt-10 first-of-type:mt-8">
            <h2 className="flex items-baseline gap-2 text-xl font-extrabold tracking-[-0.02em]">
              {league.label}
              {league.full !== league.label && <span className="text-sm font-semibold text-muted">{league.full}</span>}
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {league.types.map((t) => (
                <li key={t.id}>
                  <Link
                    href={poolTypeHref(league.id, t.id)}
                    className="group flex h-full flex-col rounded-2xl bg-bg p-5 ring-1 ring-line transition hover:ring-2 hover:ring-accent"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[17px] font-bold">{t.name}</span>
                      {!t.live && (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted ring-1 ring-line">
                          Soon
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 flex-1 text-sm text-muted">{t.text}</span>
                    <span className="mt-3 text-sm font-semibold text-accent">
                      Rules and options <span aria-hidden className="inline-block transition group-hover:translate-x-0.5">→</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <LandingFooter />
    </div>
  );
}
