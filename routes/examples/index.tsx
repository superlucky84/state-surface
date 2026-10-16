import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import ExamplesList from './_components/examplesList.js';
import { getLang } from '../../shared/i18n.js';
import { examplesContent } from '../../shared/content.js';

export default async function Page(ctx: SurfaceContext) {
  const content = examplesContent(getLang(ctx));
  return (
    <Layout header={content['page:header']}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
        <Slot name="examples:list" mode="server">
          <ExamplesList {...content['examples:list']} />
        </Slot>
      </main>
    </Layout>
  );
}
