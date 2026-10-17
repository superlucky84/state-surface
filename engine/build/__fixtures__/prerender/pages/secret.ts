import { h } from 'lithent';
import type { SurfaceContext } from '../../../../server/core/context.js';

export const prerender = true;

export default async function Page(ctx: SurfaceContext) {
  const lang = ctx.cookies.get('lang');
  return h('html', {}, h('head', {}, h('title', {}, 'Secret')), h('body', {}, lang ?? ''));
}
