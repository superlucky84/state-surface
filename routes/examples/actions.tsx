import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import ActionsPlayground from './actions/_components/actionsPlayground.js';
import ActionsLog from './actions/_components/actionsLog.js';
import CommentBoard from './actions/_components/commentBoard.js';
import LikesPanel from './actions/_components/likesPanel.js';
import LikeButton from './actions/_components/likeButton.js';
import { getLang } from '../../shared/i18n.js';
import { actionsContent } from '../../shared/content.js';

export default async function Page(ctx: SurfaceContext) {
  const content = actionsContent(getLang(ctx));
  return (
    <Layout header={content['page:header']}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
        <Slot name="actions:playground" mode="server">
          <ActionsPlayground {...content['actions:playground']} />
        </Slot>
        <Slot name="actions:log" mode="server">
          <ActionsLog {...content['actions:log']} />
        </Slot>
        <section class="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-slate-900">{content.likes.title}</h2>
          <p class="text-sm text-slate-600">{content.likes.description}</p>
          <Slot name="actions:likes" mode="server">
            <LikesPanel {...content['actions:likes']} />
          </Slot>
          <LikeButton client:load lang={content['actions:likes'].lang} />
        </section>
        <Slot name="actions:comments" mode="server">
          <CommentBoard {...content['actions:comments']} />
        </Slot>
      </main>
    </Layout>
  );
}
