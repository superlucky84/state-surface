import type { StateSurfacePlugin } from 'state-surface/client';

function scrollToBottom(el: Element) {
  const container = el.querySelector('[data-chat-scroll]') ?? el;
  container.scrollTop = container.scrollHeight;
}

function scheduleScroll(el: Element) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => scrollToBottom(el));
    return;
  }
  setTimeout(() => scrollToBottom(el), 0);
}

export function chatScrollPlugin(): StateSurfacePlugin {
  return {
    name: 'chat-scroll',
    onMount(slotName, el) {
      if (slotName !== 'chat:messages') return;
      scheduleScroll(el);
    },
    onUpdate(slotName, el) {
      if (slotName !== 'chat:messages') return;
      scheduleScroll(el);
    },
  };
}
