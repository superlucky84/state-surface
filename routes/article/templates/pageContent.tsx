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

  return (
    <article class="space-y-3 rounded-xl border border-slate-200 bg-white px-5 py-6 shadow-sm">
      <h2 class="text-2xl font-semibold tracking-tight text-slate-900">{title ?? ''}</h2>
      <p class="leading-7 text-slate-700">{body ?? ''}</p>
    </article>
  );
};

export default defineTemplate('page:content', Content);
