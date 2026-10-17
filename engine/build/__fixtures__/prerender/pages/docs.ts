import { h } from 'lithent';
import type { SurfaceContext } from '../../../../server/core/context.js';

export const prerender = true;

export const getStaticPaths = () => [{ slug: 'a' }, { slug: 'b c' }];

export default async function Page(ctx: SurfaceContext) {
  return h(
    'html',
    {},
    h('head', {}, h('title', {}, 'Doc')),
    h('body', {}, h('h1', {}, ctx.params.slug))
  );
}
