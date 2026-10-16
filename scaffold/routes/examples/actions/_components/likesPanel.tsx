import { defineServerComponent, type SurfaceContext } from 'state-surface/server';
import { readBoard } from '../../../../shared/actionsStore.server.js';

type LikesData = { lang: string; likes: number };

const LikesView = ({ lang, likes }: LikesData) => (
  <p class="text-3xl font-semibold tabular-nums text-slate-900" data-testid="likes">
    {likes}
    <span class="ml-2 text-sm font-normal text-slate-500">
      {lang === 'ko' ? '좋아요' : 'likes'}
    </span>
  </p>
);

const LikesPanel = defineServerComponent({
  load: async ({ lang }: { lang: string }, ctx: SurfaceContext): Promise<LikesData> => ({
    lang,
    likes: readBoard(ctx).likes,
  }),
  render: LikesView,
});

export default LikesPanel;
