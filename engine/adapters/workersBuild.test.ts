import { describe, it, expect } from 'vitest';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import { surface } from '../vite.js';
import { cloudflare } from './cloudflare.js';
import { node } from './node.js';

/**
 * Stage 10 regression: the demo did not start on Workers ("Prism is not defined"). The SSR
 * build left CommonJS dependencies external; wrangler bundled them afterwards, so Prism's
 * language components ran before `globalThis.Prism` was set. Workers builds bundle every
 * dependency with Vite, in module evaluation order.
 */
const ssrConfig = (plugin: Plugin) => {
  const hook = plugin.config as (user: UserConfig, env: ConfigEnv) => UserConfig;
  return hook.call({} as never, {}, { command: 'build', mode: 'production', isSsrBuild: true }).ssr;
};

describe('server bundle per adapter', () => {
  it('bundles every dependency for Workers (webworker target)', () => {
    expect(ssrConfig(surface({ adapter: cloudflare() }))).toMatchObject({
      noExternal: true,
      target: 'webworker',
    });
  });

  it('keeps Node-resolvable dependencies external elsewhere', () => {
    const config = ssrConfig(surface({ adapter: node() }));
    expect(config?.noExternal).toEqual(['lithent', 'state-surface']);
    expect(config?.target).toBeUndefined();
  });
});
