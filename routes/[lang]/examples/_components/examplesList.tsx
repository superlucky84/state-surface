import { Icon } from '../../../_shared/components/icons.js';

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

/** Accent per example: icon tile, hover border and the top glow line. */
const COLORS: Record<string, { tile: string; hover: string; line: string }> = {
  sky: {
    tile: 'bg-sky-50 text-sky-600 ring-sky-100',
    hover: 'hover:border-sky-300',
    line: 'from-sky-400/0 via-sky-400 to-sky-400/0',
  },
  violet: {
    tile: 'bg-violet-50 text-violet-600 ring-violet-100',
    hover: 'hover:border-violet-300',
    line: 'from-violet-400/0 via-violet-400 to-violet-400/0',
  },
  indigo: {
    tile: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    hover: 'hover:border-indigo-300',
    line: 'from-indigo-400/0 via-indigo-400 to-indigo-400/0',
  },
  emerald: {
    tile: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    hover: 'hover:border-emerald-300',
    line: 'from-emerald-400/0 via-emerald-400 to-emerald-400/0',
  },
  amber: {
    tile: 'bg-amber-50 text-amber-600 ring-amber-100',
    hover: 'hover:border-amber-300',
    line: 'from-amber-400/0 via-amber-400 to-amber-400/0',
  },
  rose: {
    tile: 'bg-rose-50 text-rose-600 ring-rose-100',
    hover: 'hover:border-rose-300',
    line: 'from-rose-400/0 via-rose-400 to-rose-400/0',
  },
};

/** `/en/examples/streaming` → `streaming` (the icon key). */
const demoKey = (href: string) => href.split('/').pop() ?? '';

const ExamplesList = ({ title, description, items }: ExamplesListProps) => (
  <div>
    <div class="max-w-2xl pt-10 sm:pt-14">
      <h1 class="text-4xl font-bold tracking-tight break-keep text-slate-950 sm:text-5xl">
        {title}
      </h1>
      <p class="mt-4 text-lg leading-8 break-keep text-slate-600">{description}</p>
    </div>
    <div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(item => {
        const colors = COLORS[item.color] ?? COLORS.sky;
        return (
          <a
            href={item.href}
            class={`group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 ${colors.hover}`}
          >
            <span
              aria-hidden="true"
              class={`absolute inset-x-6 top-0 h-px bg-linear-to-r opacity-0 transition group-hover:opacity-100 ${colors.line}`}
            />
            <span
              class={`grid h-11 w-11 place-items-center rounded-xl ring-1 ring-inset ${colors.tile}`}
            >
              <Icon name={demoKey(item.href)} class="h-5 w-5" />
            </span>
            <h2 class="mt-5 text-lg font-semibold text-slate-900">{item.title}</h2>
            <p class="mt-2 flex-1 text-sm leading-6 break-keep text-slate-600">
              {item.description}
            </p>
            <span
              aria-hidden="true"
              class="mt-5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-slate-900 group-hover:text-white"
            >
              &rarr;
            </span>
          </a>
        );
      })}
    </div>
  </div>
);

export default ExamplesList;
