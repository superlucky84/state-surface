import { Icon } from '../../../../_shared/components/icons.js';

type SearchInputProps = {
  query: string;
  placeholder?: string;
  label?: string;
  buttonLabel?: string;
  hint?: string;
  /** Sent with the form: results come back in the page language. */
  lang?: string;
};

const SearchInput = ({ query, placeholder, label, buttonLabel, hint, lang }: SearchInputProps) => (
  <form
    data-action="search"
    data-pending-targets="search:results"
    class="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
  >
    <input type="hidden" name="lang" value={lang ?? 'en'} />
    <p class="mb-3 text-sm font-medium text-slate-700">
      {label ?? 'Search StateSurface features and concepts'}
    </p>
    <div class="flex flex-col gap-3 sm:flex-row">
      <div class="relative min-w-0 flex-1">
        <Icon
          name="search"
          class="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          name="query"
          type="text"
          value={query}
          placeholder={placeholder ?? 'e.g. streaming, action, hydration...'}
          class="w-full rounded-full border border-slate-300 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
        />
      </div>
      <button
        type="submit"
        class="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition hover:bg-indigo-500"
      >
        {buttonLabel ?? 'Search'}
      </button>
    </div>
    <p class="mt-3 text-xs leading-5 text-slate-500">
      {hint ?? 'Form data-action triggers a search transition. Results stream as NDJSON frames.'}
    </p>
  </form>
);

export default SearchInput;
