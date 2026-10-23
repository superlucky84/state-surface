import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../../layouts/Layout.js';
import ExamplesList from './_components/examplesList.js';
import { pageLang } from '../../../shared/i18n.js';
import { examplesContent, headerProps } from '../../../shared/pages.js';

export const prerender = true;

export default async function Page(ctx: SurfaceContext) {
  const content = await examplesContent(pageLang(ctx));
  return (
    <Layout header={headerProps(ctx, { title: content.title, nav: 'examples', showTitle: false })}>
      <main class="mx-auto w-full max-w-6xl px-4 pb-24 md:px-8">
        <Slot name="examples:list">
          <ExamplesList {...content['examples:list']} />
        </Slot>
      </main>
    </Layout>
  );
}
