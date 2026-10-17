import { defineServerComponent, type Flash, type SurfaceContext } from 'state-surface/server';
import { actionUrl } from 'state-surface';
import { localPath } from '../../../../../shared/i18n.js';
import { readBoard, type Comment } from '../../../../../shared/actionsStore.server.js';

type BoardData = { lang: string; comments: Comment[]; flash?: Flash };

const CommentBoardView = ({ lang, comments, flash }: BoardData) => {
  const ko = lang === 'ko';
  const errors = flash?.error?.fieldErrors?.body;
  const draft = typeof flash?.input?.body === 'string' ? flash.input.body : '';
  return (
    <section class="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 class="text-lg font-semibold text-slate-900">
          {ko ? 'JS 없이도 동작하는 폼' : 'A form that works without JavaScript'}
        </h2>
        <p class="mt-1 text-sm text-slate-600">
          {ko
            ? 'method="post" action={actionUrl("comments/add")} 폼입니다. JS가 꺼져 있으면 303 리다이렉트와 일회성 flash로, 켜져 있으면 같은 transition을 스트림으로 실행합니다. "error"를 입력하면 서버 오류, 빈 값은 검증 오류입니다.'
            : 'A method="post" action={actionUrl("comments/add")} form. Without JavaScript it answers 303 with a one-time flash; with JavaScript the same transition streams. Type "error" for a server error, leave it empty for a validation error.'}
        </p>
      </div>
      <form method="post" action={actionUrl('comments/add')} class="space-y-2">
        <input type="hidden" name="_redirect" value={localPath(lang, '/examples/actions')} />
        <input type="hidden" name="lang" value={lang} />
        <textarea
          id="comment-body"
          name="body"
          rows={2}
          aria-invalid={errors ? 'true' : 'false'}
          class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          placeholder={ko ? '댓글을 남겨 보세요' : 'Leave a comment'}
        >
          {draft}
        </textarea>
        {errors && <p class="text-xs text-rose-600">{errors.join(', ')}</p>}
        {flash?.error && !errors && <p class="text-xs text-rose-600">{flash.error.message}</p>}
        {flash?.ok && (
          <p class="text-xs text-emerald-600">{ko ? '등록했습니다 (flash)' : 'Posted (flash)'}</p>
        )}
        <button
          type="submit"
          class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          {ko ? '댓글 등록' : 'Post comment'}
        </button>
      </form>
      <ul class="space-y-2" data-testid="comments">
        {comments.length === 0 && (
          <li class="text-sm text-slate-400">{ko ? '아직 댓글이 없습니다' : 'No comments yet'}</li>
        )}
        {comments.map(comment => (
          <li key={comment.id} class="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {comment.body}
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Server component: comments come from the store, the JS-less result from the flash. */
const CommentBoard = defineServerComponent({
  load: async ({ lang }: { lang: string }, ctx: SurfaceContext): Promise<BoardData> => {
    const flash = await ctx.flash('comments/add');
    return { lang, comments: readBoard(ctx).comments, ...(flash ? { flash } : {}) };
  },
  render: CommentBoardView,
});

export default CommentBoard;
