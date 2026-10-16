import type { SurfaceContext } from 'state-surface/server';
import { Boot, Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import GuideToc from './_components/guideToc.js';
import GuideContent from './_components/guideContent.js';
import { getLang } from '../../shared/i18n.js';
import { guideLoadingState } from '../../shared/content.js';
import { prism } from '../../client/plugins/prism.js';
import { guideToc } from '../../client/plugins/guideToc.js';

export const plugins = [prism, guideToc];

const VALID_SLUGS = [
  'quickstart',
  'surface',
  'template',
  'transition',
  'action',
  'accumulate',
  'ui-patch',
];

function parseSlug(ctx: SurfaceContext): string {
  const slug = ctx.params.slug;
  if (!VALID_SLUGS.includes(slug)) {
    throw new Error(`Invalid guide slug: "${slug}"`);
  }
  return slug;
}

/** Loading state is rendered on the server; `guide-load` streams the content after load. */
export default async function Page(ctx: SurfaceContext) {
  const slug = parseSlug(ctx);
  const lang = getLang(ctx);
  const state = guideLoadingState(slug, lang);
  return (
    <Layout header={state['page:header']}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-8 pt-4 md:flex-row md:gap-8 md:pt-6">
        <div class="w-full md:w-56 md:shrink-0">
          <Slot name="guide:toc" mode="server">
            <GuideToc {...state['guide:toc']} />
          </Slot>
        </div>
        <div class="min-w-0 flex-1">
          <Slot name="guide:content" mode="server">
            <GuideContent {...state['guide:content']} />
          </Slot>
        </div>
      </main>
      <Boot transition="guide-load" params={{ slug, lang }} />
    </Layout>
  );
}
