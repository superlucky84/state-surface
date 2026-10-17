import { createHandler, type HandlerOptions } from '../server/core/handler.js';
import { assetPath, assetHeaders, type Adapter } from './types.js';
type Bindings = Record<string, unknown> & {
  ASSETS?: { fetch(request: Request): Promise<Response> };
};
export function cloudflare(): Adapter {
  return {
    name: 'cloudflare',
    serverEntry: 'state-surface/adapters/cloudflare',
    supports: { fs: false, imageTransform: false, longStream: true },
    async readStatic(path, platform) {
      const { env, origin } = platform as { env: Bindings; origin: string };
      if (!env.ASSETS) return null;
      const response = await env.ASSETS.fetch(new Request(new URL(path, origin)));
      // 404, or a redirect of the assets' html_handling: not a stored file.
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(assetHeaders(path))) headers.set(name, value);
      return new Response(response.body, { status: response.status, headers });
    },
  };
}
export function worker(options: HandlerOptions & { streamHeartbeatMs?: number }) {
  const adapter = cloudflare();
  // Prerendered HTML comes from the ASSETS binding (`html_handling: "none"`, DC-32 ④).
  const handler = createHandler({
    readStatic: (file, platform) => adapter.readStatic(file, platform),
    ...options,
  });
  const base = options.basePath ?? options.manifest.basePath ?? '';
  const interval = options.streamHeartbeatMs ?? 250;
  if (!Number.isFinite(interval) || interval <= 0)
    throw new Error('streamHeartbeatMs must be positive');
  return {
    async fetch(
      request: Request,
      env: Bindings,
      executionContext?: { waitUntil(promise: Promise<unknown>): void }
    ) {
      const file = assetPath(request, base);
      const response =
        (file
          ? await adapter.readStatic(file, { env, origin: new URL(request.url).origin })
          : null) ?? (await handler.fetch(request, { env, executionContext }));
      if (!response.body || !response.headers.get('content-type')?.includes('ndjson'))
        return response;
      // A native writer observes disconnects even while the generator awaits remote data.
      // Blank lines are transport heartbeats, already ignored by the NDJSON decoder.
      const bridge = new TransformStream<Uint8Array, Uint8Array>();
      const reader = response.body.getReader();
      const writer = bridge.writable.getWriter();
      const pump = (async () => {
        let pending = reader.read();
        try {
          while (true) {
            let timer: ReturnType<typeof setTimeout>;
            const heartbeat = new Promise<null>(resolve => {
              timer = setTimeout(() => resolve(null), interval);
            });
            let result: ReadableStreamReadResult<Uint8Array> | null;
            try {
              result = await Promise.race([pending, heartbeat]);
            } finally {
              clearTimeout(timer!);
            }
            if (result === null) {
              await writer.write(new Uint8Array([10]));
              continue;
            }
            if (result.done) {
              await writer.close();
              break;
            }
            await writer.write(result.value);
            pending = reader.read();
          }
        } catch (error) {
          await reader.cancel(error).catch(() => {});
          await writer.abort(error).catch(() => {});
        } finally {
          reader.releaseLock();
          writer.releaseLock();
        }
      })();
      executionContext?.waitUntil(pump);
      void pump.catch(() => {});
      return new Response(bridge.readable, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  };
}
