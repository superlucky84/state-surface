import type { SurfaceContext } from 'state-surface/server';
import { getCollection, getEntry } from 'state-surface/content';
import Layout from '../../layouts/Layout';

export const prerender = true;

export async function getStaticPaths() {
  return (await getCollection('docs')).map(entry => ({ slug: entry.id }));
}

export default async function Page(ctx: SurfaceContext) {
  const entry = (await getEntry('docs', ctx.params.slug))!;
  return (
    <Layout title={String(entry.data.title)}>
      <nav id="toc">
        {entry.headings.map(heading => (
          <a href={`#${heading.id}`} data-depth={String(heading.depth)}>
            {heading.text}
          </a>
        ))}
      </nav>
      <article id="doc">
        <entry.Content />
      </article>
    </Layout>
  );
}
