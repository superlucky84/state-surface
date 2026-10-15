import type { RouteModule } from '../shared/routeModule.js';
import type { SurfaceContext } from './core/context.js';
import { getInitialResult } from './initialStates.js';
import {
  fillHState,
  buildStateScript,
  buildUiScript,
  buildBootScript,
  buildBasePathScript,
} from './ssr.js';
import type { TransitionHandler } from './transition.js';

export async function renderRoute(
  route: RouteModule,
  ctx: SurfaceContext,
  options: {
    renderer: (name: string, data: any) => string;
    getTransition: (name: string) => TransitionHandler | undefined;
  }
): Promise<string> {
  const { states, ui } = await getInitialResult(route, ctx, options);
  let boot = '';
  if (route.boot?.auto && route.transition)
    boot = buildBootScript({
      transition: route.transition,
      params: route.boot.params?.(ctx) ?? route.params?.(ctx) ?? {},
    });
  const scripts =
    (Object.keys(states).length ? buildStateScript(states) : '') +
    buildUiScript(ui) +
    boot +
    buildBasePathScript(ctx.basePath);
  const shell = route.layout(scripts, ctx);
  return fillHState(shell, states, options.renderer, ui);
}
