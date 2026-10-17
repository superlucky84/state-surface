import { h } from 'lithent';
import type { SurfaceContext } from '../../../../server/core/context.js';

export const prerender = true;

export const getStaticPaths = () => [{ lang: 'en' }, { lang: 'ko' }];

export default async function Page(ctx: SurfaceContext) {
  return h(
    'html',
    { lang: ctx.params.lang },
    h('head', {}, h('title', {}, 'Home')),
    h('body', {}, h('h1', {}, `home ${ctx.params.lang}`))
  );
}
