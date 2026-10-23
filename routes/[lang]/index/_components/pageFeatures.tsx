import { Icon } from '../../../_shared/components/icons.js';

type Feature = {
  title: string;
  description: string;
  href: string;
};

type FeaturesProps = {
  features: Feature[];
  linkLabel: string;
};

/** `/en/examples/streaming` → `streaming` (the icon key). */
const demoKey = (href: string) => href.split('/').pop() ?? '';

const Features = ({ features, linkLabel }: FeaturesProps) => (
  <div class="grid gap-4 md:grid-cols-3">
    {features.map(f => (
      <a
        key={f.title}
        href={f.href}
        class="group flex flex-col rounded-2xl border border-slate-200 bg-linear-to-b from-white to-slate-50/80 p-6 shadow-xs transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/10"
      >
        <span class="grid h-10 w-10 place-items-center rounded-full bg-slate-950 text-white shadow-md shadow-slate-900/20">
          <Icon name={demoKey(f.href)} class="h-5 w-5" />
        </span>
        <h3 class="mt-5 text-base font-semibold text-slate-900 transition group-hover:text-indigo-700">
          {f.title}
        </h3>
        <p class="mt-2 flex-1 text-sm leading-6 break-keep text-slate-600">{f.description}</p>
        <span class="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
          {linkLabel}
          <Icon name="arrowRight" class="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </a>
    ))}
  </div>
);

export default Features;
