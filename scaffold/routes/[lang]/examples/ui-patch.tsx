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
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
        <Slot name="uipatch:controls" mode="server">
          <UiPatchControls {...content['uipatch:controls']} />
        </Slot>
        <Slot name="uipatch:preview" mode="server">
          <UiPatchPreview {...content['uipatch:preview']} />
        </Slot>
      </main>
    </Layout>
  );
}
