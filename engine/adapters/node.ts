import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHandler, type HandlerOptions } from '../server/core/handler.js';
import { nodeListener } from './http.js';
import { installGracefulShutdown } from './gracefulShutdown.js';
import { assetPath, assetHeaders, checkBasePath, type Adapter } from './types.js';
import { createLogger } from '../server/logger.js';
export { installGracefulShutdown } from './gracefulShutdown.js';
export { nodeListener } from './http.js';

export function node(options: { staticDir?: string } = {}): Adapter {
  const root = path.resolve(options.staticDir ?? 'dist/client');
  return {
    name: 'node',
    serverEntry: 'state-surface/adapters/node',
    supports: { fs: true, imageTransform: true, longStream: true },
    async readStatic(file) {
      try {
        const [base, target] = await Promise.all([
          realpath(root),
          realpath(path.resolve(root, file)),
        ]);
        if (!target.startsWith(base + path.sep)) return null;
        return new Response(new Uint8Array(await readFile(target)), {
          headers: assetHeaders(file),
        });
      } catch (error) {
        if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
          return null;
        throw error;
      }
    },
  };
}
export function createNodeServer(
  options: HandlerOptions & { staticDir?: string; env?: Record<string, unknown>; origin?: string }
) {
  checkBasePath(options.manifest.basePath, options.env ?? process.env);
  const adapter = node(options);
  const handler = createHandler({ readStatic: file => adapter.readStatic(file), ...options });
  const base = options.basePath ?? options.manifest.basePath ?? '';
  return createServer(
    nodeListener(handler, {
      env: options.env,
      origin: options.origin,
      static: async request => {
        const file = assetPath(request, base);
        return file ? adapter.readStatic(file) : null;
      },
    })
  );
}
export async function serve(
  options: HandlerOptions & {
    port?: number;
    host?: string;
    staticDir?: string;
    origin?: string;
    env?: Record<string, unknown>;
  }
) {
  const logger = options.logger ?? createLogger({ nodeEnv: process.env.NODE_ENV });
  const server = createNodeServer({ ...options, logger });
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, options.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  logger.info(
    `StateSurface running at http://localhost:${(server.address() as { port: number }).port}`
  );
  installGracefulShutdown(server);
  return server;
}
