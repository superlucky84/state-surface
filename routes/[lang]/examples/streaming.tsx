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
      <main class="mx-auto grid w-full max-w-6xl gap-6 px-4 pt-8 pb-24 md:px-8 lg:grid-cols-5">
        <Slot name="demo:controls" mode="server" class="min-w-0 lg:col-span-5">
          <DemoControls {...content['demo:controls']} />
        </Slot>
        <Slot
          name="demo:timeline"
          mode="server"
          data-animate="slide-up"
          class="min-w-0 lg:col-span-3"
        >
          <DemoTimeline {...content['demo:timeline']} />
        </Slot>
        <Slot name="demo:output" mode="server" data-animate="fade" class="min-w-0 lg:col-span-2">
          <DemoOutput {...content['demo:output']} />
        </Slot>
      </main>
    </Layout>
  );
}
