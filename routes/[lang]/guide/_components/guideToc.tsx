type TocSection = { id: string; heading: string };

type TocProps = {
  slug: string;
  /** Guides in order, linked in the page language. */
  items: Array<{ slug: string; href: string }>;
  sections?: TocSection[];
};

const LABELS: Record<string, string> = {
  quickstart: '⚡ Quickstart',
  surface: 'Surface',
  template: 'Template',
  transition: 'Transition',
  action: 'Action',
  accumulate: 'Accumulate',
  'ui-patch': 'UI Patch',
};

const linkClass = (active: boolean, quickstart: boolean) => {
  const base =
    'inline-flex w-auto items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition md:flex md:w-full md:rounded-lg md:py-2';
  if (active)
    return `${base} bg-slate-900 font-semibold text-white md:bg-indigo-50 md:text-indigo-700`;
  if (quickstart) return `${base} bg-emerald-50 font-medium text-emerald-700 hover:bg-emerald-100`;
  return `${base} bg-slate-100 font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900 md:bg-transparent md:hover:bg-slate-100`;
};

const GuideToc = ({ slug, items, sections }: TocProps) => (
  <nav class="space-y-3 md:sticky md:top-24 md:max-h-[calc(100dvh-7rem)] md:space-y-1 md:overflow-y-auto md:pb-6">
    <p class="hidden px-3 pb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase md:block">
      Guides
    </p>
    <div
      data-guide-nav-scroll
      class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:block md:space-y-0.5 md:overflow-visible md:px-0 md:pb-0"
    >
      {items.map(({ slug: item, href }, i) => {
        const isActive = item === slug;
        const label = LABELS[item] ?? item.charAt(0).toUpperCase() + item.slice(1);
        return (
          <div key={item} class="shrink-0 md:shrink">
            {i === 1 ? <div class="mx-3 my-3 hidden border-t border-slate-200 md:block" /> : null}
            <a
              {...(isActive ? { 'data-guide-active': 'true', 'aria-current': 'page' } : {})}
              href={href}
              class={linkClass(isActive, item === 'quickstart')}
            >
              {label}
            </a>
            {isActive && (sections ?? []).length > 0 ? (
              <div class="mt-1 mb-2 ml-4 hidden space-y-0.5 border-l border-slate-200 md:block">
                {(sections ?? []).map(s => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    class="-ml-px block border-l border-transparent py-1 pl-3 text-[0.8125rem] leading-5 text-slate-500 transition hover:border-indigo-400 hover:text-slate-900"
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
      <div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:hidden">
        {(sections ?? []).map(s => (
          <a
            key={`${s.id}:mobile`}
            href={`#${s.id}`}
            class="block rounded-full border border-slate-200 bg-white px-3 py-1 text-xs whitespace-nowrap text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
          >
            {s.heading}
          </a>
        ))}
      </div>
    ) : null}
  </nav>
);

export default GuideToc;
