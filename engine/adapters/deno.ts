import { createHandler, type HandlerOptions } from '../server/core/handler.js';
import { assetPath, assetHeaders, type Adapter } from './types.js';

declare const Deno: {
  readFile(path: string): Promise<Uint8Array>;
  realPath(path: string): Promise<string>;
  env: { toObject(): Record<string, string> };
  serve(options: { port: number }, handler: (req: Request) => Promise<Response>): unknown;
};
export function deno(options: { staticDir?: string } = {}): Adapter {
  const root = options.staticDir ?? 'dist/client';
  return {
    name: 'deno',
    serverEntry: 'state-surface/adapters/deno',
    supports: { fs: true, imageTransform: true, longStream: true },
    async readStatic(file) {
      if (
        file.split('/').some(segment => segment === '..' || segment.startsWith('.')) ||
        file.includes('\\')
      )
        return null;
      try {
        const [base, target] = await Promise.all([
          Deno.realPath(root),
          Deno.realPath(`${root}/${file}`),
        ]);
        if (!target.startsWith(base + '/')) return null;
        return new Response(new Uint8Array(await Deno.readFile(target)), {
          headers: assetHeaders(file),
        });
      } catch (error) {
        if ((error as Error).name === 'NotFound') return null;
        throw error;
      }
    },
  };
}
export function serve(
  options: HandlerOptions & { port?: number; staticDir?: string; env?: Record<string, unknown> }
) {
  const handler = createHandler(options);
  const adapter = deno(options);
  const base = options.basePath ?? options.manifest.basePath ?? '';
  const env = options.env ?? Deno.env.toObject();
  return Deno.serve({ port: options.port ?? Number(env.PORT ?? 3000) }, async request => {
    const file = assetPath(request, base);
    return (file ? await adapter.readStatic(file) : null) ?? handler.fetch(request, { env });
  });
}
