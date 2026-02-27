import { defineTemplate } from '../../../engine/shared/templateRegistry.js';

type SearchInputProps = {
  query: string;
  placeholder?: string;
  label?: string;
  buttonLabel?: string;
  hint?: string;
};

const SearchInput = ({ query, placeholder, label, buttonLabel, hint }: SearchInputProps) => (
  <form
    data-action="search"
    data-pending-targets="search:results"
    class="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
  >
    <p class="mb-2 text-sm font-medium text-slate-700">
      {label ?? 'Search StateSurface features and concepts'}
    </p>
    <div class="flex flex-col gap-3 sm:flex-row">
      <input
        name="query"
        type="text"
        value={query}
        placeholder={placeholder ?? 'e.g. streaming, action, hydration...'}
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
      />
      <button
        type="submit"
        class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        {buttonLabel ?? 'Search'}
      </button>
    </div>
    <p class="mt-2 text-xs text-slate-500">
      {hint ?? 'Form data-action triggers a search transition. Results stream as NDJSON frames.'}
    </p>
  </form>
);

export default defineTemplate('search:input', SearchInput);
