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
    <Layout header={headerProps(ctx, { title: content.title, nav: 'examples' })}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
        <Slot name="examples:list">
          <ExamplesList {...content['examples:list']} />
        </Slot>
      </main>
    </Layout>
  );
}
