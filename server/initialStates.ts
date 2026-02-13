import type { Request } from 'express';
import type { RouteModule } from '../shared/routeModule.js';
import { getTransition } from './transition.js';

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
  req: Request
): Promise<Record<string, any>> {
  if (route.initial) {
    return await route.initial(req);
  }

  if (!route.transition) {
    return {};
  }

  const params = route.params?.(req) ?? {};
  const handler = getTransition(route.transition);

  if (!handler) {
    throw new Error(`SSR: transition "${route.transition}" not found in registry`);
  }

  const gen = handler(params);
  const { value } = await gen.next();

  // Clean up generator to avoid resource leaks
  await gen.return(undefined as never);

  if (value?.type === 'state' && value.full !== false) {
    return value.states;
  }

  throw new Error('SSR requires a full first frame when initial is missing');
}
