import { defineTemplate } from '../../../shared/templateRegistry.js';

type RecentArticle = {
  id: number;
  title: string;
  summary: string;
  href: string;
};

type RecentArticlesProps = {
  heading?: string;
  articles?: RecentArticle[];
};

const RecentArticles = ({ heading, articles }: RecentArticlesProps) => {
  const list = articles ?? [];

  return (
    <section class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-xl font-semibold tracking-tight text-slate-900">
          {heading ?? 'Recent articles'}
        </h3>
        <a
          href="/search"
          class="text-sm font-medium text-sky-700 transition hover:text-sky-900 hover:underline"
        >
          Browse all
        </a>
      </div>

      {list.length === 0 ? (
        <div class="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6 text-sm text-slate-500">
          No recent articles yet.
        </div>
      ) : (
        <ul class="grid gap-4 md:grid-cols-2">
          {list.map(article => (
            <li>
              <a
                href={article.href}
                class="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
              >
                <p class="text-xs font-semibold uppercase tracking-wide text-sky-600">
                  Article #{article.id}
                </p>
                <h4 class="mt-2 text-lg font-semibold text-slate-900 transition group-hover:text-sky-700">
                  {article.title}
                </h4>
                <p class="mt-2 text-sm leading-6 text-slate-600">{article.summary}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default defineTemplate('page:recent-articles', RecentArticles);
