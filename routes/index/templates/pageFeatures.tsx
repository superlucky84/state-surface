import { defineTemplate } from '../../../engine/shared/templateRegistry.js';

type Feature = {
  title: string;
  description: string;
  href: string;
};

type FeaturesProps = {
  features: Feature[];
};

const Features = ({ features }: FeaturesProps) => (
  <section class="space-y-4">
    <h3 class="text-xl font-semibold tracking-tight text-slate-900">Feature Demos</h3>
    <div class="grid gap-4 md:grid-cols-3">
      {features.map(f => (
        <a
          key={f.title}
          href={f.href}
          class="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
        >
          <h4 class="text-base font-semibold text-slate-900 transition group-hover:text-sky-700">
            {f.title}
          </h4>
          <p class="mt-2 text-sm leading-6 text-slate-600">{f.description}</p>
        </a>
      ))}
    </div>
  </section>
);

export default defineTemplate('page:features', Features);
