import { defineTemplate } from '../../../shared/templateRegistry.js';

type Comment = { author: string; text: string };
type CommentsProps = { articleId: number; comments: Comment[] };

const Comments = ({ comments }: CommentsProps) => (
  <section class="comments">
    <h3>Comments ({comments.length})</h3>
    {comments.map(c => (
      <div class="comment">
        <strong>{c.author}</strong>: {c.text}
      </div>
    ))}
  </section>
);

export default defineTemplate('panel:comments', Comments);
