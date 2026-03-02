import type { StateSurfaceServerOptions } from './server/index.js';

export { defineTransition } from './server/transition.js';
export type { TransitionHandler } from './server/transition.js';
export type {
  TransitionHooks,
  BeforeTransitionContext,
  AfterTransitionContext,
} from './server/hooks.js';
export type { StateSurfaceServerOptions } from './server/index.js';

export async function createApp(options?: StateSurfaceServerOptions) {
  const mod = await import('./server/index.js');
  return mod.createApp(options);
}
