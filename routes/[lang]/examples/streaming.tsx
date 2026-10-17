import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../../layouts/Layout.js';
import DemoControls from './streaming/_components/demoControls.js';
import DemoTimeline from './streaming/_components/demoTimeline.js';
import DemoOutput from './streaming/_components/demoOutput.js';
import { pageLang } from '../../../shared/i18n.js';
import { headerProps, streamingContent } from '../../../shared/pages.js';

// Prerendered: the HTML is built once, the stream-demo transition still updates its slots.
export const prerender = true;

export default async function Page(ctx: SurfaceContext) {
  const content = await streamingContent(pageLang(ctx));
  return (
    <Layout header={headerProps(ctx, { title: content.title, nav: 'examples', back: true })}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
        <Slot name="demo:controls" mode="server">
          <DemoControls {...content['demo:controls']} />
        </Slot>
        <Slot name="demo:timeline" mode="server" data-animate="slide-up">
          <DemoTimeline {...content['demo:timeline']} />
        </Slot>
        <Slot name="demo:output" mode="server" data-animate="fade">
          <DemoOutput {...content['demo:output']} />
        </Slot>
      </main>
    </Layout>
  );
}
