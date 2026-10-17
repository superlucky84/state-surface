import { h } from 'lithent';
import type { SurfaceContext } from '../../../../server/core/context.js';

export const prerender = true;

// Entries without `lang` are built for every locale; `lang` limits one to its language.
export const getStaticPaths = () => [{ slug: 'shared' }, { lang: 'ko', slug: 'only-ko' }];

export default async function Page(ctx: SurfaceContext) {
  return h(
    'html',
    { lang: ctx.params.lang },
    h('head', {}, h('title', {}, 'Docs')),
    h('body', {}, h('h1', {}, `${ctx.params.lang} ${ctx.params.slug}`))
  );
}
