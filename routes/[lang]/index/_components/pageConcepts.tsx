import { Icon } from '../../../_shared/components/icons.js';

type Concept = {
  key: string;
  title: string;
  description: string;
  href: string;
};

type ConceptsProps = {
  concepts: Concept[];
  linkLabel: string;
};

const ACCENTS: Record<string, string> = {
  surface: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
  template: 'bg-violet-50 text-violet-600 ring-violet-100',
  transition: 'bg-sky-50 text-sky-600 ring-sky-100',
  action: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
};

const Concepts = ({ concepts, linkLabel }: ConceptsProps) => (
  <div class="grid gap-4 sm:grid-cols-2">
    {concepts.map((c, i) => (
      <a
        key={c.key}
        href={c.href}
        class="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xs transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/10"
      >
        <div class="flex items-center justify-between">
          <span
            class={`grid h-11 w-11 place-items-center rounded-xl ring-1 ring-inset ${ACCENTS[c.key] ?? ACCENTS.surface}`}
          >
            <Icon name={c.key} class="h-5 w-5" />
          </span>
          <span aria-hidden="true" class="font-mono text-xs font-medium text-slate-300">
            {String(i + 1).padStart(2, '0')}
          </span>
        </div>
        <h3 class="mt-5 text-lg font-semibold text-slate-900">{c.title}</h3>
        <p class="mt-2 flex-1 text-sm leading-6 break-keep text-slate-600">{c.description}</p>
        <span class="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
          {linkLabel}
          <Icon name="arrowRight" class="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </a>
    ))}
  </div>
);

export default Concepts;
