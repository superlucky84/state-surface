import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../layouts/Layout.js';
import PageHero from './index/_components/pageHero.js';
import PageConcepts from './index/_components/pageConcepts.js';
import PageFeatures from './index/_components/pageFeatures.js';
import { getLang } from '../shared/i18n.js';
import { homeContent } from '../shared/content.js';

export default async function Page(ctx: SurfaceContext) {
  const content = homeContent(getLang(ctx));
  return (
    <Layout header={content['page:header']}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-8 pt-4 md:pt-6">
        <Slot name="page:hero" mode="server">
          <PageHero {...content['page:hero']} />
        </Slot>
        <section class="border-t border-slate-200 pt-8">
          <h2 class="mb-4 text-lg font-semibold text-slate-800">Core Concepts</h2>
          <Slot name="page:concepts" mode="server">
            <PageConcepts {...content['page:concepts']} />
          </Slot>
        </section>
        <section class="border-t border-slate-200 pt-8">
          <h2 class="mb-4 text-lg font-semibold text-slate-800">Features</h2>
          <Slot name="page:features" mode="server">
            <PageFeatures {...content['page:features']} />
          </Slot>
        </section>
      </main>
    </Layout>
  );
}
