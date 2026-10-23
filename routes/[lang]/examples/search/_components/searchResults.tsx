type SearchItem = { title: string; description: string; href: string };
type SearchResultsProps = {
  loading: boolean;
  query: string;
  items?: SearchItem[];
  /** Page-language messages with a `{query}` placeholder (content/pages/<lang>/search.yaml). */
  labels?: { loading: string; empty: string };
};

const DEFAULT_LABELS = {
  loading: 'Searching for "{query}"...',
  empty: 'No results found for "{query}".',
};

const SearchResults = ({ loading, query, items, labels = DEFAULT_LABELS }: SearchResultsProps) => {
  const message = (template: string) => template.replace('{query}', query);
  if (loading) {
    return (
      <div class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500 shadow-xs">
        <span
          aria-hidden="true"
          class="h-4 w-4 shrink-0 rounded-full border-2 border-indigo-200 border-t-indigo-600 motion-safe:animate-spin"
        />
        {message(labels.loading)}
      </div>
    );
  }

  const list = items ?? [];
  if (list.length === 0) {
    return (
      <div class="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">
        {message(labels.empty)}
      </div>
    );
  }

  return (
    <ul class="grid gap-3 sm:grid-cols-2">
      {list.map((item, i) => (
        <li key={i}>
          <a
            href={item.href}
            class="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-xs transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-500/10"
          >
            <p class="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900 group-hover:text-indigo-700">
              {item.title}
              <span
                aria-hidden="true"
                class="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"
              >
                &rarr;
              </span>
            </p>
            <p class="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
          </a>
        </li>
      ))}
    </ul>
  );
};

export default SearchResults;
