import type { RequestHandler } from 'express';
import { createHandler, type HandlerOptions } from '../server/core/handler.js';
import { createImageService } from '../images/service.js';
import { nodeListener } from './http.js';
import { node } from './node.js';
import { assetPath, checkBasePath, type Adapter } from './types.js';

export function express(options: { staticDir?: string } = {}): Adapter {
  return { ...node(options), name: 'express', serverEntry: 'state-surface/adapters/express' };
}
export function surface(
  options: HandlerOptions & { staticDir?: string; env?: Record<string, unknown>; origin?: string }
): RequestHandler {
  checkBasePath(options.manifest.basePath, options.env ?? process.env);
  const adapter = express(options);
  const handler = createHandler({
    readStatic: file => adapter.readStatic(file),
    // DC-26: `/_surface/image` resizes allowed remote images (sharp, disk cache).
    images: createImageService(),
    ...options,
  });
  const base = options.basePath ?? options.manifest.basePath ?? '';
  const listener = nodeListener(handler, {
    env: options.env,
    origin: options.origin,
    static: async request => {
      const file = assetPath(request, base);
      return file ? adapter.readStatic(file) : null;
    },
  });
  return (req, res, next) => {
    if (req.readableEnded && req.method !== 'GET' && req.method !== 'HEAD') {
      next(new Error('Mount surface() before express.json()/other body parsers'));
      return;
    }
    void listener(req, res);
  };
}
