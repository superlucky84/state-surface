import { h } from 'lithent';
import type { SurfaceContext } from '../../../../server/core/context.js';

export const prerender = true;

// No getStaticPaths: a route whose only param is [lang] is built for every locale.
export default async function Page(ctx: SurfaceContext) {
  return h(
    'html',
    { lang: ctx.params.lang },
    h('head', {}, h('title', {}, 'Home')),
    h('body', {}, h('h1', {}, `home ${ctx.params.lang}`))
  );
}
