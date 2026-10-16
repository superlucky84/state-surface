import { definePlugin } from 'state-surface/client';

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

/** Scrolls the chat to the latest message when messages render or update. */
export const chatScroll = definePlugin({
  name: 'chat-scroll',
  slots: ['chat:messages'],
  load: 'load',
  attach(el) {
    scheduleScroll(el);
  },
  update(el) {
    scheduleScroll(el);
  },
});
