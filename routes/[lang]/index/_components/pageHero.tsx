import { Image } from 'state-surface';
import { Icon } from '../../../_shared/components/icons.js';
import hero from '../_assets/hero.png';

type HeroProps = {
  badge: string;
  title: string;
  highlight: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  commandLabel: string;
  command: string;
  imageAlt: string;
};

const Hero = ({
  badge,
  title,
  highlight,
  description,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  commandLabel,
  command,
  imageAlt,
}: HeroProps) => (
  <section class="relative pt-12 text-center sm:pt-20">
    <div
      aria-hidden="true"
      class="site-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem]"
    />
    <p class="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white/80 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-700 shadow-xs backdrop-blur">
      <span aria-hidden="true" class="relative flex h-2 w-2">
        <span class="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-60 motion-safe:animate-ping" />
        <span class="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
      </span>
      {badge}
    </p>
    <h1 class="mx-auto mt-6 max-w-4xl text-4xl leading-[1.1] font-bold tracking-tight break-keep text-slate-950 sm:text-6xl">
      {title}{' '}
      <span class="block bg-linear-to-r from-indigo-600 via-violet-600 to-sky-500 bg-clip-text pb-1 text-transparent">
        {highlight}
      </span>
    </h1>
    <p class="mx-auto mt-6 max-w-2xl text-base leading-7 break-keep text-slate-600 sm:text-lg sm:leading-8">
      {description}
    </p>
    <div class="mt-9 flex flex-wrap justify-center gap-3">
      <a
        href={primaryHref}
        class="group inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-slate-800"
      >
        {primaryLabel}
        <Icon name="arrowRight" class="h-4 w-4 transition group-hover:translate-x-0.5" />
      </a>
      <a
        href={secondaryHref}
        class="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-xs ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-slate-300"
      >
        <Icon name="play" class="h-4 w-4 text-indigo-600" />
        {secondaryLabel}
      </a>
    </div>
    <p class="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-slate-500">
      <span>{commandLabel}</span>
      <code class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[0.8125rem] text-slate-800">
        <span aria-hidden="true" class="text-indigo-500 select-none">
          ${' '}
        </span>
        {command}
      </code>
    </p>
    <div class="relative mx-auto mt-14 max-w-5xl sm:mt-16">
      <div
        aria-hidden="true"
        class="absolute -inset-x-4 -inset-y-4 -z-10 rounded-[2.5rem] bg-linear-to-tr from-indigo-500/25 via-violet-500/15 to-sky-400/25 blur-2xl"
      />
      {/* DC-26: WebP srcset from the build, width/height against layout shift, LCP preload. */}
      <Image
        src={hero}
        alt={imageAlt}
        width={960}
        priority
        class="w-full rounded-2xl shadow-2xl ring-1 shadow-indigo-950/20 ring-slate-900/10"
      />
    </div>
  </section>
);

export default Hero;
