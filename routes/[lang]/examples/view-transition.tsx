import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../../layouts/Layout.js';
import VTDescription from './view-transition/_components/vtDescription.js';
import VTGallery from './view-transition/_components/vtGallery.js';
import { pageLang } from '../../../shared/i18n.js';
import { headerProps, viewTransitionContent } from '../../../shared/pages.js';

export const prerender = true;

export default async function Page(ctx: SurfaceContext) {
  const content = await viewTransitionContent(pageLang(ctx));
  return (
    <Layout header={headerProps(ctx, { title: content.title, nav: 'examples', back: true })}>
      <main class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-8 pb-24 md:px-8">
        <Slot name="vt:description" mode="server">
          <VTDescription {...content['vt:description']} />
        </Slot>
        <Slot name="vt:gallery" mode="server">
          <VTGallery {...content['vt:gallery']} />
        </Slot>
      </main>
    </Layout>
  );
}
