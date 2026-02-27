import { defineTemplate } from '../../../engine/shared/templateRegistry.js';

type SearchItem = { title: string; description: string; href: string };
type SearchResultsProps = {
  loading: boolean;
  query: string;
  items?: SearchItem[];
};

const SearchResults = ({ loading, query, items }: SearchResultsProps) => {
  if (loading) {
    return (
      <div class="rounded-xl border border-slate-200 bg-white px-5 py-6 text-slate-500 shadow-sm">
        Searching for "{query}"...
      </div>
    );
  }

  const list = items ?? [];
  if (list.length === 0) {
    return (
      <div class="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6 text-slate-500">
        No results found for "{query}".
      </div>
    );
  }

  return (
    <ul class="space-y-3">
      {list.map((item, i) => (
        <li key={i}>
          <a
            href={item.href}
            class="block rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
          >
            <p class="text-sm font-semibold text-slate-900">{item.title}</p>
            <p class="mt-1 text-sm text-slate-600">{item.description}</p>
          </a>
        </li>
      ))}
    </ul>
  );
};

export default defineTemplate('search:results', SearchResults);
