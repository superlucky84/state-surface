import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import UiPatchControls from './ui-patch/_components/uipatchControls.js';
import UiPatchPreview from './ui-patch/_components/uipatchPreview.js';
import { getLang } from '../../shared/i18n.js';
import { uiPatchContent } from '../../shared/content.js';

export default async function Page(ctx: SurfaceContext) {
  const content = uiPatchContent(getLang(ctx));
  return (
    <Layout header={content['page:header']}>
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
