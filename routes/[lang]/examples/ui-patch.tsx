import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../../layouts/Layout.js';
import UiPatchControls from './ui-patch/_components/uipatchControls.js';
import UiPatchPreview from './ui-patch/_components/uipatchPreview.js';
import { pageLang } from '../../../shared/i18n.js';
import { headerProps, uiPatchContent } from '../../../shared/pages.js';

export const prerender = true;

export default async function Page(ctx: SurfaceContext) {
  const content = await uiPatchContent(pageLang(ctx));
  return (
    <Layout header={headerProps(ctx, { title: content.title, nav: 'examples', back: true })}>
      <main class="mx-auto grid w-full max-w-6xl items-start gap-6 px-4 pt-8 pb-24 md:px-8 lg:grid-cols-5">
        <Slot name="uipatch:controls" mode="server" class="min-w-0 lg:col-span-3">
          <UiPatchControls {...content['uipatch:controls']} />
        </Slot>
        <Slot
          name="uipatch:preview"
          mode="server"
          class="min-w-0 lg:sticky lg:top-24 lg:col-span-2"
        >
          <UiPatchPreview {...content['uipatch:preview']} />
        </Slot>
      </main>
    </Layout>
  );
}
