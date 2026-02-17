import { defineTemplate } from '../../../shared/templateRegistry.js';

type HeroProps = {
  badge?: string;
  title: string;
  description: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

const Hero = ({
  badge,
  title,
  description,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
}: HeroProps) => (
  <section class="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">
      {badge ?? 'State-Layout Mapping Runtime'}
    </p>
    <h2 class="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{title}</h2>
    <p class="mt-4 max-w-3xl text-base leading-7 text-slate-600">{description}</p>
    <div class="mt-6 flex flex-wrap gap-3">
      <a
        href={primaryHref ?? '/guide/surface'}
        class="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        {primaryLabel ?? 'Read the Guide'}
      </a>
      <a
        href={secondaryHref ?? '/features/streaming'}
        class="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        {secondaryLabel ?? 'Try Streaming Demo'}
      </a>
    </div>
  </section>
);

export default defineTemplate('page:hero', Hero);
