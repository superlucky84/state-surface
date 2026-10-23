import { defineServerComponent, type Flash, type SurfaceContext } from 'state-surface/server';
import { actionUrl } from 'state-surface';
import { localPath } from '../../../../../shared/i18n.js';
import { readBoard, type Comment } from '../../../../../shared/actionsStore.server.js';

type BoardData = { lang: string; comments: Comment[]; flash?: Flash };

const CommentBoardView = ({ lang, comments, flash }: BoardData) => {
  const ko = lang === 'ko';
  const errors = flash?.error?.fieldErrors?.body;
  // The flash echoes the field after every JS-less submission: refill it only after a failure.
  const draft = flash && !flash.ok && typeof flash.input?.body === 'string' ? flash.input.body : '';
  return (
    <section class="h-full space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
      <div>
        <h2 class="text-lg font-semibold tracking-tight text-slate-950">
          {ko ? 'JS 없이도 동작하는 폼' : 'A form that works without JavaScript'}
        </h2>
        <p class="mt-1 text-sm leading-6 text-slate-600">
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
          class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
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
          class="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {ko ? '댓글 등록' : 'Post comment'}
        </button>
      </form>
      <ul class="space-y-2" data-testid="comments">
        {comments.length === 0 && (
          <li class="text-sm text-slate-400">{ko ? '아직 댓글이 없습니다' : 'No comments yet'}</li>
        )}
        {comments.map(comment => (
          <li
            key={comment.id}
            class="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 ring-1 ring-slate-100 ring-inset"
          >
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
