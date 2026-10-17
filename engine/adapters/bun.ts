import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHandler, type HandlerOptions } from '../server/core/handler.js';
import { assetPath, assetHeaders, checkBasePath, type Adapter } from './types.js';

declare const Bun: {
  env: Record<string, string | undefined>;
  file(path: string): Blob & { exists(): Promise<boolean> };
  serve(options: { port: number; fetch: (req: Request) => Promise<Response> }): unknown;
};
export function bun(options: { staticDir?: string } = {}): Adapter {
  const root = options.staticDir ?? 'dist/client';
  return {
    name: 'bun',
    serverEntry: 'state-surface/adapters/bun',
    supports: { fs: true, imageTransform: true, longStream: true },
    async readStatic(file) {
      if (
        file.split('/').some(segment => segment === '..' || segment.startsWith('.')) ||
        file.includes('\\')
      )
        return null;
      try {
        const [base, target] = await Promise.all([
          realpath(root),
          realpath(path.resolve(root, file)),
        ]);
        if (!target.startsWith(base + path.sep)) return null;
        const asset = Bun.file(target);
        return (await asset.exists()) ? new Response(asset, { headers: assetHeaders(file) }) : null;
      } catch (error) {
        if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes((error as { code?: string }).code ?? ''))
          return null;
        throw error;
      }
    },
  };
}
export function serve(
  options: HandlerOptions & { port?: number; staticDir?: string; env?: Record<string, unknown> }
) {
  checkBasePath(options.manifest.basePath, options.env ?? Bun.env);
  const adapter = bun(options);
  const handler = createHandler({ readStatic: file => adapter.readStatic(file), ...options });
  const base = options.basePath ?? options.manifest.basePath ?? '';
  const env = options.env ?? Bun.env;
  return Bun.serve({
    port: options.port ?? Number(env.PORT ?? 3000),
    async fetch(request) {
      const file = assetPath(request, base);
      return (file ? await adapter.readStatic(file) : null) ?? handler.fetch(request, { env });
    },
  });
}
