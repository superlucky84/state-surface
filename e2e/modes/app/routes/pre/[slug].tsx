import type { SurfaceContext } from 'state-surface/server';
import Layout from '../../layouts/Layout';

export const prerender = true;

// Only these params are built; /pre/other is 404.
export function getStaticPaths() {
  return [{ slug: 'one' }, { slug: 'two' }];
}

export default async function Page(ctx: SurfaceContext) {
  return (
    <Layout title={`Prerendered ${ctx.params.slug}`}>
      <h1 id="slug">{ctx.params.slug}</h1>
    </Layout>
  );
}
