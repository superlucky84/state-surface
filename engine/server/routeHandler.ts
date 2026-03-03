import type { Request, Response } from 'express';
import type { RouteModule } from '../shared/routeModule.js';
import { getInitialStates } from './initialStates.js';
import { fillHState, buildStateScript, buildBootScript, buildBasePathScript } from './ssr.js';
import { createSSRRenderer } from './ssrRenderer.js';
import { getBasePath } from '../shared/basePath.js';
import type { TransitionHandler } from './transition.js';

type RouteHandlerOptions = {
  renderer?: (name: string, data: any) => string;
  getTransition?: (name: string) => TransitionHandler | undefined;
};

/**
 * Create an Express GET handler for a route module.
 * Performs per-route SSR: initial states → layout → fillHState → respond.
 */
export function createRouteHandler(routeModule: RouteModule, options: RouteHandlerOptions = {}) {
  const renderer = options.renderer ?? createSSRRenderer();

  return async (req: Request, res: Response) => {
    try {
      const initialStates = await getInitialStates(routeModule, req, {
        getTransition: options.getTransition,
      });

      const hasStates = Object.keys(initialStates).length > 0;
      const stateScript = hasStates ? buildStateScript(initialStates) : '';

      let bootScript = '';
      if (routeModule.boot?.auto && routeModule.transition) {
        const bootParams = routeModule.boot.params?.(req) ?? routeModule.params?.(req) ?? {};
        bootScript = buildBootScript({
          transition: routeModule.transition,
          params: bootParams,
        });
      }

      const basePathScript = buildBasePathScript(getBasePath());
      const shell = routeModule.layout(stateScript + bootScript + basePathScript);
      const html = hasStates ? fillHState(shell, initialStates, renderer) : shell;

      res.status(200).type('text/html; charset=utf-8').send(html);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SSR error';
      console.error(`[SSR] ${req.path}: ${message}`);
      if (process.env.NODE_ENV === 'production') {
        res.status(500).type('text/html; charset=utf-8').send('Internal Server Error');
      } else {
        res.status(500).type('text/html; charset=utf-8').send(`SSR Error: ${message}`);
      }
    }
  };
}
