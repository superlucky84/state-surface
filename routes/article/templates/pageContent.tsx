import { defineTemplate } from '../../../shared/templateRegistry.js';

type ContentProps = {
  loading?: boolean;
  title?: string;
  body?: string;
  articleId?: number;
};

const Content = ({ loading, title, body, articleId }: ContentProps) => {
  if (loading) {
    return (
      <div class="rounded-xl border border-slate-200 bg-white px-5 py-6 text-slate-500 shadow-sm">
        Loading article #{articleId ?? ''}...
      </div>
    );
  }

  const articleTabs = [1, 2, 3];

  return (
    <article class="space-y-4 rounded-xl border border-slate-200 bg-white px-5 py-6 shadow-sm">
      <h2 class="text-2xl font-semibold tracking-tight text-slate-900">{title ?? ''}</h2>
      <p class="leading-7 text-slate-700">{body ?? ''}</p>
      <div class="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
        <span class="text-xs font-medium uppercase tracking-wide text-slate-500">Load article</span>
        {articleTabs.map(id => (
          <button
            key={id}
            type="button"
            data-action="article-load"
            data-params={`{"articleId":${id}}`}
            data-pending-targets="page:content,panel:comments"
            class={
              articleId === id
                ? 'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50'
            }
          >
            #{id}
          </button>
        ))}
      </div>
    </article>
  );
};

export default defineTemplate('page:content', Content);
