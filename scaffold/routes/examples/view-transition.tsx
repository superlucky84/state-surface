import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import VTDescription from './view-transition/_components/vtDescription.js';
import VTGallery from './view-transition/_components/vtGallery.js';
import { getLang } from '../../shared/i18n.js';
import { viewTransitionContent } from '../../shared/content.js';

export default async function Page(ctx: SurfaceContext) {
  const content = viewTransitionContent(getLang(ctx));
  return (
    <Layout header={content['page:header']}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
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
