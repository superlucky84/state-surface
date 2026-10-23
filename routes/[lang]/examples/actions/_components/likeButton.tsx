import { mount } from 'lithent';
import { useAction } from 'state-surface/client';

/**
 * Client island using the component action API (DESIGN 7장). `run({ delta, lang })` is typed from
 * `transitions/like.ts`; the handle re-renders this island with pending, first result and
 * error. The like count itself is the server slot `actions:likes`.
 */
const LikeButton = mount<{ lang: string }>((renew, { lang }) => {
  const like = useAction(renew, 'like');
  const ko = lang === 'ko';
  const status = () => {
    if (like.pending) return ko ? '처리 중…' : 'Saving…';
    if (like.error) {
      const fields = Object.values(like.error.fieldErrors ?? {}).flat();
      return `${like.error.kind}: ${fields.join(', ') || like.error.message}`;
    }
    if (like.aborted) return ko ? '취소됨' : 'Aborted';
    if (like.hasResult) return ko ? '저장됨' : 'Saved';
    return undefined;
  };
  return () => (
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        data-testid="like"
        onClick={() => void like.run({ delta: 1, lang })}
        class="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-rose-600/25 transition hover:bg-rose-500"
      >
        {ko ? '좋아요 +1' : 'Like +1'}
      </button>
      <button
        type="button"
        data-testid="like-invalid"
        onClick={() => void like.run({ delta: 99, lang })}
        class="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 transition ring-inset hover:bg-slate-50"
      >
        {ko ? '+99 (검증 실패)' : '+99 (fails validation)'}
      </button>
      {/* null, not '': Lithent hydration cannot later fill an empty SSR text node. */}
      <span class="text-xs text-slate-500" data-testid="like-status">
        {status() ?? null}
      </span>
    </div>
  );
});

export default LikeButton;
