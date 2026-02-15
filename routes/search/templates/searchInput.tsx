import { defineTemplate } from '../../../shared/templateRegistry.js';

type SearchInputProps = { query: string };

const SearchInput = ({ query }: SearchInputProps) => (
  <div class="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
    <p class="mb-2 text-sm font-medium text-slate-700">Search query</p>
    <input
      type="text"
      value={query}
      placeholder="Search..."
      class="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
    />
    <p class="mt-2 text-xs text-slate-500">Search transition streams results as NDJSON frames.</p>
  </div>
);

export default defineTemplate('search:input', SearchInput);
