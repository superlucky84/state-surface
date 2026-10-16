import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import DemoControls from './streaming/_components/demoControls.js';
import DemoTimeline from './streaming/_components/demoTimeline.js';
import DemoOutput from './streaming/_components/demoOutput.js';
import { getLang } from '../../shared/i18n.js';
import { streamingContent } from '../../shared/content.js';

export default async function Page(ctx: SurfaceContext) {
  const content = streamingContent(getLang(ctx));
  return (
    <Layout header={content['page:header']}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
        <Slot name="demo:controls" client:load>
          <DemoControls {...content['demo:controls']} />
        </Slot>
        <Slot name="demo:timeline" client:load data-animate="slide-up">
          <DemoTimeline {...content['demo:timeline']} />
        </Slot>
        <Slot name="demo:output" client:load data-animate="fade">
          <DemoOutput {...content['demo:output']} />
        </Slot>
      </main>
    </Layout>
  );
}
