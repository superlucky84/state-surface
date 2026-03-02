import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getTransition } from './transition.js';
import { validateStateFrame } from '../shared/protocol.js';
import { encodeFrame } from '../shared/ndjson.js';
import { bootstrapServer } from './bootstrap.js';
import { scanRoutes, fileToUrlPattern } from './routeScanner.js';
import { createRouteHandler } from './routeHandler.js';
import { setBasePath, prefixPath } from '../shared/basePath.js';
import { loadManifest } from './assets.js';
import type { RouteModule } from '../shared/routeModule.js';
import type { TransitionHooks } from './hooks.js';

export interface StateSurfaceServerOptions {
  port?: number;
  basePath?: string;
  securityHeaders?: boolean;
  bodyLimit?: string;
  transitionTimeout?: number;
  hooks?: TransitionHooks;
}

function resolveRootDir(): string {
  try {
    return fileURLToPath(new URL('../..', import.meta.url));
  } catch {
    return process.cwd();
  }
}

function extractRouteModule(mod: any): RouteModule {
  const candidate = mod?.default ?? mod;
  if (candidate && typeof candidate.layout === 'function') {
    return candidate as RouteModule;
  }
  throw new Error('Route module must default-export an object with a layout function');
}

type RouteEntry = { urlPattern: string; mod: any };

/**
 * Try loading route modules via import.meta.glob (works in Vite bundle).
 * Returns null if glob is not available (e.g. plain Node.js / tsx dev mode).
 */
function loadRoutesFromGlob(): RouteEntry[] | null {
  try {
    const entries = Object.entries(
      import.meta.glob(
        [
          '/routes/**/*.ts',
          '!**/*.test.ts',
          '!**/transitions/**',
          '!**/templates/**',
          '!**/_shared/**',
        ],
        { eager: true }
      )
    );
    const routes: RouteEntry[] = [];
    for (const [filePath, mod] of entries) {
      // Convert glob path (e.g. /routes/search.ts) to relative path for URL pattern
      const relativePath = filePath.replace(/^\/routes\//, '');
      const urlPattern = fileToUrlPattern(relativePath);
      routes.push({ urlPattern, mod });
    }
    // Sort: static before dynamic
    return routes.sort((a, b) => {
      const aDynamic = a.urlPattern.includes(':');
      const bDynamic = b.urlPattern.includes(':');
      if (aDynamic !== bDynamic) return aDynamic ? 1 : -1;
      return a.urlPattern.localeCompare(b.urlPattern);
    });
  } catch {
    return null;
  }
}

export async function createApp(options?: StateSurfaceServerOptions) {
  const port = options?.port ?? (Number(process.env.PORT) || 3000);
  const basePath = options?.basePath ?? process.env.BASE_PATH ?? '';
  setBasePath(basePath);

  const app = express();
  app.use(express.json({ limit: options?.bodyLimit ?? '100kb' }));

  // Auto-register transitions and templates
  await bootstrapServer();

  // Auto-discover and register route modules
  // Try glob first (works in Vite SSR bundle), fall back to filesystem scan
  const registeredPatterns: string[] = [];
  const globRoutes = loadRoutesFromGlob();
  if (globRoutes) {
    for (const { urlPattern, mod } of globRoutes) {
      const routeModule = extractRouteModule(mod);
      app.get(prefixPath(urlPattern), createRouteHandler(routeModule));
      registeredPatterns.push(urlPattern);
    }
  } else {
    const routesDir = path.join(resolveRootDir(), 'routes');
    const scannedRoutes = await scanRoutes(routesDir);
    for (const route of scannedRoutes) {
      const mod = await import(pathToFileURL(route.filePath).href);
      const routeModule = extractRouteModule(mod);
      app.get(prefixPath(route.urlPattern), createRouteHandler(routeModule));
      registeredPatterns.push(route.urlPattern);
    }
  }

  // POST /transition/:name — NDJSON streaming endpoint
  app.post(prefixPath('/transition/:name'), async (req, res) => {
    const handler = getTransition(req.params.name);

    if (!handler) {
      res.status(404).json({ error: `Transition "${req.params.name}" not found` });
      return;
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
      const defaultBody =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const body = options?.hooks?.onBeforeTransition
        ? ((await options.hooks.onBeforeTransition({
            name: req.params.name,
            body: { ...defaultBody },
            req,
            res,
          })) ?? defaultBody)
        : defaultBody;
      const gen = handler(body);

      for await (const frame of gen) {
        // Validate before streaming
        const result = validateStateFrame(frame);
        if (!result.valid) {
          const errorFrame = encodeFrame({
            type: 'error',
            message: `Invalid frame: ${result.reason}`,
          });
          res.write(errorFrame);
          break;
        }

        res.write(encodeFrame(frame));

        if (frame.type === 'done') break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown server error';
      res.write(encodeFrame({ type: 'error', message }));
    } finally {
      try {
        await options?.hooks?.onAfterTransition?.({
          name: req.params.name,
          req,
          res,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[TransitionHook] onAfterTransition failed: ${message}`);
      }
      res.end();
    }
  });

  // Dev server with Vite middleware for client-side TS
  async function startDev() {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    // Vite handles client TS/JS module serving
    app.use(vite.middlewares);

    // 404 handler — AFTER Vite middleware so assets are served first
    app.use((_req, res) => {
      res.status(404).send('Not Found');
    });

    app.listen(port, () => {
      console.log(`StateSurface dev server running at http://localhost:${port}`);
      console.log(`  Routes: ${registeredPatterns.join(', ')}`);
      console.log(`  Debug overlay: http://localhost:${port}/?debug=1`);
    });
  }

  // Production mode: serve static files from dist/client
  // Use cwd() because resolveRootDir() is relative to source layout (engine/server/),
  // which doesn't match the bundled dist/server.js location.
  async function startProd() {
    const rootDir = process.cwd();
    loadManifest(rootDir);
    app.use(express.static(path.join(rootDir, 'dist/client')));

    app.use((_req, res) => {
      res.status(404).send('Not Found');
    });
  }

  if (process.env.NODE_ENV === 'test') {
    app.use((_req: express.Request, res: express.Response) => {
      res.status(404).send('Not Found');
    });
  } else if (process.env.NODE_ENV === 'production') {
    await startProd();
  } else {
    await startDev();
  }

  return { app, port };
}
