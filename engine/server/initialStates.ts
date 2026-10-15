import type { SurfaceContext } from './core/context.js';
import type { RouteModule } from '../shared/routeModule.js';
import type { UiPatch } from '../shared/protocol.js';
import { getTransition, type TransitionHandler } from './transition.js';

type InitialStatesOptions = {
  getTransition?: (name: string) => TransitionHandler | undefined;
};

export type InitialResult = {
  states: Record<string, any>;
  ui: Record<string, UiPatch | null>;
};

/**
 * Resolve the initial states for SSR rendering.
 *
 * Resolution order (from DESIGN.md Section 2.5):
 * 1. If route.initial exists, use it.
 * 2. If no transition, return {} (static page).
 * 3. Run transition, collect first full frame's states.
 * 4. If first frame is partial, throw (500).
 */
export async function getInitialStates(
  route: RouteModule,
  ctx: SurfaceContext,
  options: InitialStatesOptions = {}
): Promise<Record<string, any>> {
  if (route.initial) {
    return await route.initial(ctx);
  }

  if (!route.transition) {
    return {};
  }

  const result = await getInitialResult(route, ctx, options);
  return result.states;
}

/**
 * Resolve initial states and ui for SSR rendering.
 * Returns both states and ui from the first full frame.
 */
export async function getInitialResult(
  route: RouteModule,
  ctx: SurfaceContext,
  options: InitialStatesOptions = {}
): Promise<InitialResult> {
  if (route.initial) {
    const states = await route.initial(ctx);
    return { states, ui: {} };
  }

  if (!route.transition) {
    return { states: {}, ui: {} };
  }

  const params = route.params?.(ctx) ?? {};
  const resolveTransition = options.getTransition ?? getTransition;
  const handler = resolveTransition(route.transition);

  if (!handler) {
    throw new Error(`SSR: transition "${route.transition}" not found in registry`);
  }

  const gen = handler(params, ctx);
  const { value } = await gen.next();

  // Clean up generator to avoid resource leaks
  await gen.return(undefined as never);

  if (value?.type === 'state' && value.full !== false) {
    return { states: value.states, ui: value.ui ?? {} };
  }

  throw new Error('SSR requires a full first frame when initial is missing');
}
