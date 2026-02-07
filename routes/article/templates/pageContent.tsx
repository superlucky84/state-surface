import { defineTemplate } from '../../../shared/templateRegistry.js';

type ContentProps = {
  loading?: boolean;
  title?: string;
  body?: string;
  articleId?: number;
};

const Content = ({ loading, title, body, articleId }: ContentProps) => {
  if (loading) {
    return <div class="loading">Loading article #{articleId ?? ''}...</div>;
  }

  return (
    <article class="article-content">
      <h2>{title ?? ''}</h2>
      <p>{body ?? ''}</p>
    </article>
  );
};

export default defineTemplate('page:content', Content);
