import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import PageHero from './index/_components/pageHero.js';
import PageConcepts from './index/_components/pageConcepts.js';
import PageFeatures from './index/_components/pageFeatures.js';
import { Icon } from '../_shared/components/icons.js';
import { pageLang } from '../../shared/i18n.js';
import { headerProps, homeContent, type SectionHeading } from '../../shared/pages.js';

// Built once per language (DC-24): `/en`, `/ko` and the language-less `/` copy.
export const prerender = true;

const Heading = ({ id, eyebrow, title, description }: SectionHeading & { id: string }) => (
  <div class="mx-auto mb-10 max-w-2xl text-center">
    <p class="text-sm font-semibold text-indigo-600">{eyebrow}</p>
    <h2
      id={id}
      class="mt-2 text-3xl font-bold tracking-tight break-keep text-slate-950 sm:text-4xl"
    >
      {title}
    </h2>
    <p class="mt-4 text-base leading-7 break-keep text-slate-600">{description}</p>
  </div>
);

export default async function Page(ctx: SurfaceContext) {
  const content = await homeContent(pageLang(ctx));
  const { cta } = content;
  return (
    <Layout header={headerProps(ctx, { title: content.title, nav: 'home', showTitle: false })}>
      <main class="mx-auto w-full max-w-6xl px-4 pb-24 md:px-8">
        <Slot name="page:hero">
          <PageHero {...content['page:hero']} />
        </Slot>
        <section aria-labelledby="concepts-title" class="mt-28">
          <Heading id="concepts-title" {...content.sections.concepts} />
          <Slot name="page:concepts">
            <PageConcepts {...content['page:concepts']} />
          </Slot>
        </section>
        <section aria-labelledby="features-title" class="mt-28">
          <Heading id="features-title" {...content.sections.features} />
          <Slot name="page:features">
            <PageFeatures {...content['page:features']} />
          </Slot>
        </section>
        <section
          aria-labelledby="cta-title"
          class="relative mt-28 overflow-hidden rounded-3xl bg-slate-950 px-6 py-14 text-center shadow-2xl shadow-indigo-950/30 sm:px-12"
        >
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_18rem_at_50%_-4rem,rgb(99_102_241/0.45),transparent_70%),radial-gradient(30rem_16rem_at_100%_100%,rgb(14_165_233/0.25),transparent_70%)]"
          />
          <h2
            id="cta-title"
            class="relative text-3xl font-bold tracking-tight break-keep text-white sm:text-4xl"
          >
            {cta.title}
          </h2>
          <p class="relative mx-auto mt-4 max-w-xl text-base leading-7 break-keep text-slate-300">
            {cta.description}
          </p>
          <div class="relative mt-8 flex flex-wrap justify-center gap-3">
            <a
              href={cta.primaryHref}
              class="group inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-indigo-50"
            >
              {cta.primaryLabel}
              <Icon name="arrowRight" class="h-4 w-4 transition group-hover:translate-x-0.5" />
            </a>
            <a
              href={cta.secondaryHref}
              class="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/10"
            >
              {cta.secondaryLabel}
            </a>
          </div>
          <p class="relative mt-8 font-mono text-sm break-all text-slate-400">
            <span aria-hidden="true" class="text-indigo-400 select-none">
              ${' '}
            </span>
            {cta.command}
          </p>
        </section>
      </main>
    </Layout>
  );
}
