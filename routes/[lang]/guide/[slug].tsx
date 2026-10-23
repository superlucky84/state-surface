import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import { getCollection, getEntry } from 'state-surface/content';
import Layout from '../../../layouts/Layout.js';
import GuideToc from './_components/guideToc.js';
import { guideComponents } from './_components/guideContent.js';
import prose from './_components/guideProse.module.css';
import { Icon } from '../../_shared/components/icons.js';
import { localPath, pageLang } from '../../../shared/i18n.js';
import { headerProps, pageText } from '../../../shared/pages.js';
import { guideToc } from '../../../client/plugins/guideToc.js';

export const plugins = [guideToc];

/**
 * Guides are the `guides` Markdown collection (DC-25), built into static pages per language
 * (DC-24): no loading state and no transition, the HTML is the guide.
 */
export const prerender = true;

export async function getStaticPaths() {
  return (await getCollection('guides')).map(entry => ({ lang: entry.lang!, slug: entry.id }));
}

const LABELS: Record<string, { demo: string; previous: string; next: string; pager: string }> = {
  en: { demo: 'See it running', previous: 'Previous', next: 'Next', pager: 'Guides' },
  ko: { demo: '직접 실행해 보기', previous: '이전', next: '다음', pager: '가이드' },
};

export default async function Page(ctx: SurfaceContext) {
  const lang = pageLang(ctx);
  const entry = await getEntry('guides', ctx.params.slug, { lang });
  if (!entry) throw new Error(`No guide "${ctx.params.slug}" in ${lang}`);
  const guides = (await getCollection('guides', { lang })).sort(
    (a, b) => a.data.order - b.data.order
  );
  const index = guides.findIndex(guide => guide.id === entry.id);
  const previous = guides[index - 1];
  const next = guides[index + 1];
  const t = await pageText('guide', lang);
  const labels = LABELS[lang] ?? LABELS.en;
  return (
    <Layout
      header={headerProps(ctx, {
        title: `${t.title}: ${entry.data.title}`,
        nav: 'guide',
        showTitle: false,
      })}
    >
      <main class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-24 md:flex-row md:gap-12 md:px-8 md:pt-12">
        <div class="w-full md:w-56 md:shrink-0">
          <Slot name="guide:toc">
            <GuideToc
              slug={entry.id}
              items={guides.map(guide => ({
                slug: guide.id,
                href: localPath(lang, `/guide/${guide.id}`),
              }))}
              sections={entry.headings.map(heading => ({ id: heading.id, heading: heading.text }))}
            />
          </Slot>
        </div>
        <article class={`${prose.article} min-w-0 flex-1 break-words lg:max-w-3xl`}>
          <div class="border-b border-slate-200 pb-8">
            <p class="text-sm font-semibold text-indigo-600">{t.title}</p>
            <h1 class="mt-2 text-3xl font-bold tracking-tight break-keep text-slate-950 sm:text-4xl">
              {entry.data.title}
            </h1>
          </div>
          <div class="mt-10 space-y-14">
            <entry.Content components={guideComponents(lang)} />
          </div>
          {entry.data.demoHref && entry.data.demoLabel && (
            <a
              href={localPath(lang, entry.data.demoHref)}
              class="group relative mt-14 flex items-center justify-between gap-4 overflow-hidden rounded-2xl bg-slate-950 p-6 transition hover:shadow-xl hover:shadow-indigo-950/20"
            >
              <span
                aria-hidden="true"
                class="pointer-events-none absolute inset-0 bg-[radial-gradient(28rem_12rem_at_0%_0%,rgb(99_102_241/0.45),transparent_70%)]"
              />
              <span class="relative">
                <span class="block text-sm font-medium text-indigo-200">{labels.demo}</span>
                <span class="mt-1 block text-lg font-semibold text-white">
                  {entry.data.demoLabel}
                </span>
              </span>
              <span
                aria-hidden="true"
                class="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-950 transition group-hover:translate-x-0.5"
              >
                <Icon name="arrowRight" class="h-4 w-4" />
              </span>
            </a>
          )}
          <nav aria-label={labels.pager} class="mt-10 grid gap-4 sm:grid-cols-2">
            {previous && (
              <a
                href={localPath(lang, `/guide/${previous.id}`)}
                class="group rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <span class="flex items-center gap-1 text-xs font-medium text-slate-500">
                  <Icon name="arrowLeft" class="h-3.5 w-3.5" />
                  {labels.previous}
                </span>
                <span class="mt-1 block font-semibold text-slate-900 group-hover:text-indigo-700">
                  {previous.data.title}
                </span>
              </a>
            )}
            {next && (
              <a
                href={localPath(lang, `/guide/${next.id}`)}
                class="group rounded-xl border border-slate-200 p-4 text-right transition hover:border-indigo-300 hover:bg-indigo-50/40 sm:col-start-2"
              >
                <span class="flex items-center justify-end gap-1 text-xs font-medium text-slate-500">
                  {labels.next}
                  <Icon name="arrowRight" class="h-3.5 w-3.5" />
                </span>
                <span class="mt-1 block font-semibold text-slate-900 group-hover:text-indigo-700">
                  {next.data.title}
                </span>
              </a>
            )}
          </nav>
        </article>
      </main>
    </Layout>
  );
}
