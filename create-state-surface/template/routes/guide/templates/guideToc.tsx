import { defineTemplate, prefixPath } from 'state-surface';

type TocSection = { id: string; heading: string };

type TocProps = {
  slug: string;
  items: string[];
  sections?: TocSection[];
};

const LABELS: Record<string, string> = {
  quickstart: '⚡ Quickstart',
  surface: 'Surface',
  template: 'Template',
  transition: 'Transition',
  action: 'Action',
  accumulate: 'Accumulate',
};

const GuideToc = ({ slug, items, sections }: TocProps) => (
  <nav class="space-y-2 md:sticky md:top-6 md:space-y-1">
    <p class="hidden text-xs font-semibold uppercase tracking-wide text-slate-500 md:block">Guides</p>
    <div
      data-guide-nav-scroll
      class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:block md:space-y-1 md:overflow-visible md:px-0 md:pb-0"
    >
      {items.map((item, i) => {
        const isActive = item === slug;
        const isQuickstart = item === 'quickstart';
        const label = LABELS[item] ?? item.charAt(0).toUpperCase() + item.slice(1);
        return (
          <div key={item} class="shrink-0 md:shrink">
            {i === 1 ? <div class="my-2 hidden border-t border-slate-200 md:block" /> : null}
            <a
              data-guide-active={isActive ? 'true' : undefined}
              href={prefixPath(`/guide/${item}`)}
              class={
                isActive
                  ? 'inline-flex w-auto whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white md:block md:w-full'
                  : isQuickstart
                    ? 'inline-flex w-auto whitespace-nowrap rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 md:block md:w-full'
                    : 'inline-flex w-auto whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 md:block md:w-full'
              }
            >
              {label}
            </a>
            {isActive && (sections ?? []).length > 0 ? (
              <div class="ml-2 mt-0.5 hidden space-y-0.5 border-l-2 border-slate-200 pl-3 md:block">
                {(sections ?? []).map(s => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    class="block py-0.5 text-xs text-slate-400 transition hover:text-slate-700"
                  >
                    {s.heading}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
    {(sections ?? []).length > 0 ? (
      <div class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:hidden">
        {(sections ?? []).map(s => (
          <a
            key={`${s.id}:mobile`}
            href={`#${s.id}`}
            class="block whitespace-nowrap rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            {s.heading}
          </a>
        ))}
      </div>
    ) : null}
  </nav>
);

export default defineTemplate('guide:toc', GuideToc);
