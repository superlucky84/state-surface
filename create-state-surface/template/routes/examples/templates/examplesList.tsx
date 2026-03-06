import { defineTemplate, prefixPath } from 'state-surface';

type ExampleItem = {
  title: string;
  description: string;
  href: string;
  color: string;
};

type ExamplesListProps = {
  title: string;
  description: string;
  items: ExampleItem[];
  lang: string;
};

const COLOR_MAP: Record<string, { bg: string; border: string; icon: string }> = {
  sky: {
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    icon: 'text-sky-600',
  },
  violet: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    icon: 'text-violet-600',
  },
  indigo: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    icon: 'text-indigo-600',
  },
  emerald: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: 'text-emerald-600',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-600',
  },
};

const ExamplesList = ({ title, description, items }: ExamplesListProps) => {
  return (
    <div class="flex flex-col gap-6">
      <div>
        <h2 class="text-xl font-semibold text-slate-900">{title}</h2>
        <p class="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => {
          const colors = COLOR_MAP[item.color] ?? COLOR_MAP.sky;
          return (
            <a
              href={item.href}
              class={`group flex flex-col gap-2 rounded-xl border ${colors.border} ${colors.bg} p-5 transition hover:shadow-md`}
            >
              <h3 class={`text-base font-semibold ${colors.icon}`}>{item.title}</h3>
              <p class="text-sm leading-relaxed text-slate-600">{item.description}</p>
              <span class="mt-auto pt-2 text-xs font-medium text-slate-400 transition group-hover:text-slate-600">
                &rarr;
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default defineTemplate('examples:list', ExamplesList);
