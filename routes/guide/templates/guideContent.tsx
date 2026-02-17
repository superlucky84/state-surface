import { defineTemplate } from '../../../shared/templateRegistry.js';

type Section = {
  id: string;
  heading: string;
  body: string;
};

type GuideContentProps = {
  slug: string;
  loading?: boolean;
  title?: string;
  sections?: Section[];
};

const GuideContent = ({ slug, loading, title, sections }: GuideContentProps) => {
  if (loading) {
    return (
      <div class="space-y-4">
        <div class="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div class="h-4 w-full animate-pulse rounded bg-slate-200" />
        <div class="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  return (
    <article class="space-y-6">
      <h2 class="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
      {(sections ?? []).map(s => (
        <section key={s.id} id={s.id} class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-900">{s.heading}</h3>
          <p class="mt-2 text-sm leading-7 text-slate-600">{s.body}</p>
        </section>
      ))}
      <div class="flex flex-wrap gap-2 pt-2">
        {['surface', 'template', 'transition', 'action']
          .filter(s => s !== slug)
          .map(s => (
            <a
              key={s}
              href={`/guide/${s}`}
              class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              {s.charAt(0).toUpperCase() + s.slice(1)} Guide
            </a>
          ))}
      </div>
    </article>
  );
};

export default defineTemplate('guide:content', GuideContent);
