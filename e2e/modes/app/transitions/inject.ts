import { defineTransition } from 'state-surface/server';

// Attacker-shaped props for a strict client slot: a javascript: link, an upper-case event
// attribute and an iframe navigation. The browser guard removes all three.
export default defineTransition(async function* () {
  yield {
    type: 'state',
    states: {
      link: {
        href: 'javascript:window.__xss=1',
        label: 'evil',
        attrs: { ONCLICK: 'window.__xss=2' },
        frame: 'javascript:parent.__xss=3',
      },
    },
  };
});
