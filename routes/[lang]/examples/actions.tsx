import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../../layouts/Layout.js';
import ActionsPlayground from './actions/_components/actionsPlayground.js';
import ActionsLog from './actions/_components/actionsLog.js';
import CommentBoard from './actions/_components/commentBoard.js';
import LikesPanel from './actions/_components/likesPanel.js';
import LikeButton from './actions/_components/likeButton.js';
import { pageLang } from '../../../shared/i18n.js';
import { actionsContent, headerProps } from '../../../shared/pages.js';

// Rendered per request: likes, comments and the JS-less form's flash are per visitor.
export default async function Page(ctx: SurfaceContext) {
  const content = await actionsContent(pageLang(ctx));
  return (
    <Layout header={headerProps(ctx, { title: content.title, nav: 'examples', back: true })}>
      <main class="mx-auto grid w-full max-w-6xl gap-6 px-4 pt-8 pb-24 md:px-8 lg:grid-cols-5">
        <Slot name="actions:playground" mode="server" class="min-w-0 lg:col-span-3">
          <ActionsPlayground {...content['actions:playground']} />
        </Slot>
        <Slot name="actions:log" mode="server" class="min-w-0 lg:col-span-2">
          <ActionsLog {...content['actions:log']} />
        </Slot>
        <section class="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
          <div>
            <h2 class="text-lg font-semibold tracking-tight text-slate-950">
              {content.likes.title}
            </h2>
            <p class="mt-1 text-sm leading-6 text-slate-600">{content.likes.description}</p>
          </div>
          <Slot name="actions:likes" mode="server">
            <LikesPanel {...content['actions:likes']} />
          </Slot>
          <LikeButton client:load lang={content['actions:likes'].lang} />
        </section>
        <Slot name="actions:comments" mode="server" class="min-w-0 lg:col-span-3">
          <CommentBoard {...content['actions:comments']} />
        </Slot>
      </main>
    </Layout>
  );
}
