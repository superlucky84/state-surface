import { defineTemplate } from '../../../shared/templateRegistry.js';

type Comment = { author: string; text: string };
type CommentsProps = { articleId: number; comments: Comment[] };

const Comments = ({ comments }: CommentsProps) => (
  <section class="space-y-3 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
    <h3 class="text-lg font-semibold text-slate-900">Comments ({comments.length})</h3>
    <ul class="space-y-2">
      {comments.map((c, i) => (
        <li key={i} class="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <strong class="font-semibold text-slate-900">{c.author}</strong>: {c.text}
        </li>
      ))}
    </ul>
  </section>
);

export default defineTemplate('panel:comments', Comments);
