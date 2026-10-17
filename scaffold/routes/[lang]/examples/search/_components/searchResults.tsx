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
      <div class="rounded-xl border border-slate-200 bg-white px-5 py-6 text-slate-500 shadow-sm">
        {message(labels.loading)}
      </div>
    );
  }

  const list = items ?? [];
  if (list.length === 0) {
    return (
      <div class="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6 text-slate-500">
        {message(labels.empty)}
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

export default SearchResults;
