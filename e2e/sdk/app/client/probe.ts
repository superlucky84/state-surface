import { definePlugin } from 'state-surface/client';

/**
 * Errors for the SDKs to collect: `#app-error` throws from an app event listener (uncaught),
 * and box content with `data-crash` makes this plugin's attach throw, which the engine
 * catches and hands to `reportError` (DC-12).
 */
export const probe = definePlugin({
  name: 'probe',
  slots: ['box'],
  load: 'load',
  attach(el) {
    if (el.querySelector('[data-crash]')) throw new Error('probe attach failed');
    const button = document.getElementById('app-error');
    const fail = () => {
      throw new Error('app click failed');
    };
    button?.addEventListener('click', fail);
    return () => button?.removeEventListener('click', fail);
  },
});
