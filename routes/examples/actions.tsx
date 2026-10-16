import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import ActionsPlayground from './actions/_components/actionsPlayground.js';
import ActionsLog from './actions/_components/actionsLog.js';
import { getLang } from '../../shared/i18n.js';
import { actionsContent } from '../../shared/content.js';

export default async function Page(ctx: SurfaceContext) {
  const content = actionsContent(getLang(ctx));
  return (
    <Layout header={content['page:header']}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
        <Slot name="actions:playground" client:load>
          <ActionsPlayground {...content['actions:playground']} />
        </Slot>
        <Slot name="actions:log" client:load>
          <ActionsLog {...content['actions:log']} />
        </Slot>
      </main>
    </Layout>
  );
}
