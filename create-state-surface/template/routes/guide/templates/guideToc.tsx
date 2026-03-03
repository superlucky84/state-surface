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
  <nav class="sticky top-6 space-y-1">
    <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Guides</p>
    {items.map((item, i) => {
      const isActive = item === slug;
      const isQuickstart = item === 'quickstart';
      const label = LABELS[item] ?? item.charAt(0).toUpperCase() + item.slice(1);
      const activeSections = sections ?? [];
      return (
        <div key={item}>
          {i === 1 ? <div class="my-2 border-t border-slate-200" /> : null}
          <a
            href={prefixPath(`/guide/${item}`)}
            class={
              isActive
                ? 'block rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white'
                : isQuickstart
                  ? 'block rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100'
                  : 'block rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900'
            }
          >
            {label}
          </a>
          {isActive && activeSections.length > 0 ? (
            <div class="ml-2 mt-0.5 space-y-0.5 border-l-2 border-slate-200 pl-3">
              {activeSections.map(s => (
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
  </nav>
);

export default defineTemplate('guide:toc', GuideToc);
