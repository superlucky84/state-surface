import manifest from 'virtual:state-surface/manifest';
import { createNodeServer } from 'state-surface/adapters/node';
import type { HandlerOptions } from 'state-surface/server';

/** Demo test harness; production always uses the generated build manifest unchanged. */
export async function createDemo(options: Omit<Partial<HandlerOptions>, 'manifest'> = {}) {
  return {
    server: createNodeServer({
      ...options,
      development: true,
      manifest: { ...manifest, basePath: undefined },
    }),
  };
}
