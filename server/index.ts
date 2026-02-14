import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getTransition } from './transition.js';
import { validateStateFrame } from '../shared/protocol.js';
import { encodeFrame } from '../shared/ndjson.js';
import { bootstrapServer } from './bootstrap.js';
import { scanRoutes } from './routeScanner.js';
import { createRouteHandler } from './routeHandler.js';
import type { RouteModule } from '../shared/routeModule.js';

const app = express();
const PORT = 3000;

app.use(express.json());

// Auto-register transitions and templates
await bootstrapServer();

// Auto-discover and register route modules
function resolveRootDir(): string {
  try {
    return fileURLToPath(new URL('..', import.meta.url));
  } catch {
    return process.cwd();
  }
}

const routesDir = path.join(resolveRootDir(), 'routes');
const scannedRoutes = await scanRoutes(routesDir);

for (const route of scannedRoutes) {
  const mod = await import(pathToFileURL(route.filePath).href);
  const routeModule = extractRouteModule(mod);
  app.get(route.urlPattern, createRouteHandler(routeModule));
}

// POST /transition/:name — NDJSON streaming endpoint
app.post('/transition/:name', async (req, res) => {
  const handler = getTransition(req.params.name);

  if (!handler) {
    res.status(404).json({ error: `Transition "${req.params.name}" not found` });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    const gen = handler(req.body ?? {});

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
  }

  res.end();
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

  app.listen(PORT, () => {
    console.log(`StateSurface dev server running at http://localhost:${PORT}`);
    console.log(`  Routes: ${scannedRoutes.map(r => r.urlPattern).join(', ')}`);
    console.log(`  Debug overlay: http://localhost:${PORT}/?debug=1`);
  });
}

function extractRouteModule(mod: any): RouteModule {
  const candidate = mod?.default ?? mod;
  if (candidate && typeof candidate.layout === 'function') {
    return candidate as RouteModule;
  }
  throw new Error('Route module must default-export an object with a layout function');
}

// In test mode, add 404 handler directly (no Vite middleware)
if (process.env.NODE_ENV === 'test') {
  app.use((_req: express.Request, res: express.Response) => {
    res.status(404).send('Not Found');
  });
} else {
  startDev();
}

export { app };
