import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import { getCollection, getEntry } from 'state-surface/content';
import Layout from '../../../layouts/Layout.js';
import GuideToc from './_components/guideToc.js';
import { guideComponents } from './_components/guideContent.js';
import prose from './_components/guideProse.module.css';
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

const CONCEPTS = ['surface', 'template', 'transition', 'action'];

export default async function Page(ctx: SurfaceContext) {
  const lang = pageLang(ctx);
  const entry = await getEntry('guides', ctx.params.slug, { lang });
  if (!entry) throw new Error(`No guide "${ctx.params.slug}" in ${lang}`);
  const guides = (await getCollection('guides', { lang })).sort(
    (a, b) => a.data.order - b.data.order
  );
  const t = await pageText('guide', lang);
  return (
    <Layout header={headerProps(ctx, { title: `${t.title}: ${entry.data.title}`, nav: 'guide' })}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8 pt-4 md:flex-row md:gap-8 md:pt-6">
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
        <article class={`${prose.article} min-w-0 flex-1 space-y-6`}>
          <h2 class="text-2xl font-semibold tracking-tight text-slate-900">{entry.data.title}</h2>
          <entry.Content components={guideComponents(lang)} />
          <div class="flex flex-wrap items-center gap-3 pt-2">
            {entry.data.demoHref && entry.data.demoLabel && (
              <a
                href={localPath(lang, entry.data.demoHref)}
                class="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                {entry.data.demoLabel}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-3.5 w-3.5"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M3 7h8M7 3l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </a>
            )}
            {CONCEPTS.filter(slug => slug !== entry.id).map(slug => (
              <a
                href={localPath(lang, `/guide/${slug}`)}
                class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                {slug.charAt(0).toUpperCase() + slug.slice(1)} Guide
              </a>
            ))}
          </div>
        </article>
      </main>
    </Layout>
  );
}
