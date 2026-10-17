import { definePlugin } from 'state-surface/client';

// `markerActive` counts live attachments (router leak check: attach/cleanup stay paired).
const counter = globalThis as { markerActive?: number };

export const marker = definePlugin({
  name: 'marker',
  slots: ['box'],
  load: 'load',
  attach(el) {
    counter.markerActive = (counter.markerActive ?? 0) + 1;
    el.setAttribute('data-plugin', 'attached');
    return () => {
      counter.markerActive!--;
      el.removeAttribute('data-plugin');
    };
  },
});
