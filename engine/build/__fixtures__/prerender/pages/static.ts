import { h } from 'lithent';

export const prerender = true;

export default async function Page() {
  return h(
    'html',
    {},
    h('head', {}, h('title', {}, 'Static')),
    h(
      'body',
      {},
      h('h1', {}, 'static'),
      // A JS-less action form: its redirect target is this static page (build warning).
      h('form', { method: 'post', action: '/_surface/action/comments/add' })
    )
  );
}
