import { h } from 'lithent';

export const prerender = true;

export default async function Page() {
  return h(
    'html',
    {},
    h('head', {}, h('title', {}, 'Static')),
    h('body', {}, h('h1', {}, 'static'))
  );
}
