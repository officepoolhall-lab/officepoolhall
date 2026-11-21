import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui";
import { CREATE, LandingFooter, LandingHeader, SIGN_IN } from "@/components/landing/Landing";
import { LEAGUES } from "@/lib/poolCatalog";
import { findPoolType, poolTypeHref } from "@/lib/poolGuides";

// A pool type's page, linked from the landing page's footer: how it plays, how it scores, and
// what the commissioner can set. Public, like the landing page.

export function generateStaticParams() {
  return LEAGUES.flatMap((l) => l.types.map((t) => ({ league: l.id, type: t.id })));
}

export async function generateMetadata({ params }: PageProps<"/formats/[league]/[type]">): Promise<Metadata> {
  const { league, type } = await params;
  const found = findPoolType(league, type);
  if (!found) return {};
  return { title: `${found.league.label} ${found.type.name}`, description: found.type.text };
}

export default async function PoolTypePage({ params }: PageProps<"/formats/[league]/[type]">) {
  const { league, type } = await params;
  const found = findPoolType(league, type);
  if (!found) notFound();
  const { league: l, type: t, guide } = found;
  const others = l.types.filter((x) => x.id !== t.id);
  // Starting this pool: sign in, then Start a Pool opens on this type's template.
  const start = t.template ? `/login?next=${encodeURIComponent(`/pools/new?type=${t.template}`)}` : CREATE;

  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <div className="text-sm font-semibold text-muted">
          <Link href="/" className="-mx-1 rounded px-1 hover:bg-hover hover:text-ink">Home</Link>
          <span className="mx-1.5 text-faint">/</span>
          {l.full}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
            {l.label} {t.name}
          </h1>
          {!t.live && <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted ring-1 ring-line">Coming soon</span>}
        </div>
        <p className="mt-3 text-lg text-muted">{t.text}</p>

        {guide ? (
          <div className="mt-10 space-y-10">
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">How it works</h2>
              <ol className="mt-4 space-y-3">
                {guide.how.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white tabular-nums dark:text-black">{i + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Scoring</h2>
              <ul className="mt-4 space-y-2">
                {guide.scoring.map((x, i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Tiebreakers</h2>
              <ul className="mt-4 space-y-2">
                {guide.tiebreakers.map((x, i) => (
                  <li key={i} className="flex gap-3">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-2xl bg-surface p-5 sm:p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">What the commissioner can set</h2>
              <ul className="mt-4 space-y-2.5">
                {guide.options.map((x, i) => (
                  <li key={i} className="flex gap-3 text-[15px]">
                    <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-accent">
                      <path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
                Need a rule that isn&apos;t here?{" "}
                <Link href="/#support" className="font-semibold text-accent hover:underline">Contact the site&apos;s creator</Link> and it can be built for your pool.
              </p>
            </section>
          </div>
        ) : (
          <p className="mt-8 rounded-2xl bg-surface p-5 text-muted">
            This pool type is on the way. Want it for your group?{" "}
            <Link href="/#support" className="font-semibold text-accent hover:underline">Let the site&apos;s creator know</Link>.
          </p>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <LinkButton href={start} kind="accent" className="!h-12 !px-6">
            Start your pool →
          </LinkButton>
          <LinkButton href={SIGN_IN} kind="secondary" className="!h-12 !px-6">
            Sign in
          </LinkButton>
        </div>

        {others.length > 0 && (
          <section className="mt-14 border-t border-line pt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">More {l.full} pools</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {others.map((x) => (
                <li key={x.id}>
                  <Link href={poolTypeHref(l.id, x.id)} className="inline-flex h-9 items-center rounded-full bg-bg px-4 text-sm font-semibold text-ink ring-1 ring-line hover:bg-hover">
                    {x.name}
                    {!x.live && <span className="ml-1.5 text-[11px] uppercase tracking-wide text-faint">Soon</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <LandingFooter />
    </div>
  );
}
