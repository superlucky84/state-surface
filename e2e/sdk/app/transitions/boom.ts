import { defineTransition } from 'state-surface/server';

// An unexpected server error: the onError hook reports it, the page shows system:error.
export default defineTransition({
  targets: ['box'],
  async *handler() {
    throw new Error('server boom');
  },
});
