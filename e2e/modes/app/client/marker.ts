import { definePlugin } from 'state-surface/client';

export const marker = definePlugin({
  name: 'marker',
  slots: ['box'],
  load: 'load',
  attach(el) {
    el.setAttribute('data-plugin', 'attached');
    return () => el.removeAttribute('data-plugin');
  },
});
