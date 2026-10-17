import { build } from 'vite';
import config from '../vite.config.js';
import { surface } from '../engine/vite.js';
import { node } from '../engine/adapters/node.js';
import { express } from '../engine/adapters/express.js';
import { bun } from '../engine/adapters/bun.js';
import { deno } from '../engine/adapters/deno.js';
import { cloudflare } from '../engine/adapters/cloudflare.js';
import { DEFAULT_LOCALE, LOCALES } from '../shared/locales.js';

for (const adapter of [node(), express(), bun(), deno(), cloudflare()]) {
  await build({
    ...config,
    configFile: false,
    logLevel: 'warn',
    plugins: [
      surface({ adapter, i18n: { locales: [...LOCALES], defaultLocale: DEFAULT_LOCALE } }),
      ...(config.plugins ?? []).filter(
        plugin => (plugin as { name?: string }).name !== 'state-surface'
      ),
    ],
    build: {
      ssr: 'virtual:state-surface/entry',
      outDir: `dist/adapter-app/${adapter.name}`,
      emptyOutDir: true,
      rollupOptions: { output: { entryFileNames: 'server.mjs' } },
    },
    ssr: {
      noExternal: adapter.name === 'cloudflare' ? (true as const) : ['lithent', 'state-surface'],
      target: adapter.name === 'cloudflare' ? 'webworker' : 'node',
    },
  });
  console.log(`Application build passed: ${adapter.name}`);
}
