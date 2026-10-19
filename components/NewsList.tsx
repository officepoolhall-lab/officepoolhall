import type { NewsStory } from "@/lib/news";
import { SectionLabel } from "./ui";

/** "12m ago" / "3h ago" / "2d ago". */
function ago(iso: string, now: number) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

/** Top stories: thumbnail, headline and a one-line summary, each opening the story on its site in a new tab. */
export function NewsList({ stories, now, title = "Top stories" }: { stories: NewsStory[]; now: number; title?: string }) {
  return (
    <section aria-labelledby="news">
      <div className="flex min-h-11 items-baseline justify-between gap-3">
        <SectionLabel>
          <span id="news">{title}</span>
        </SectionLabel>

      </div>
      {!stories.length ? (
        <p className="border-y border-line py-3 text-sm text-muted">Stories aren&apos;t available right now. Check back soon.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {stories.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="group flex gap-3 py-2.5">
                {s.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote thumbnails, sized by CSS
                  <img src={s.image} alt="" loading="lazy" className="h-14 w-24 shrink-0 rounded-lg bg-surface object-cover" />
                ) : (
                  <span className="h-14 w-24 shrink-0 rounded-lg bg-surface" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:underline">{s.headline}</span>
                  {s.description && <span className="mt-0.5 line-clamp-1 text-xs text-muted">{s.description}</span>}
                  <span className="mt-0.5 block text-[11px] text-faint">
                    <span className="font-semibold text-muted">{s.source}</span>
                    {s.video && <span className="text-muted"> · Video</span>}
                    {s.published && <> · {ago(s.published, now)}</>}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
