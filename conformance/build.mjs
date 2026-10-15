import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist/conformance', { recursive: true });
for (const adapter of ['node', 'express', 'bun', 'deno', 'cloudflare']) {
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      ssr: `conformance/entry-${adapter}.ts`,
      outDir: 'dist/conformance',
      emptyOutDir: false,
      rollupOptions: { output: { entryFileNames: `${adapter}.mjs` } },
    },
    ssr: { noExternal: ['lithent'], target: adapter === 'cloudflare' ? 'webworker' : 'node' },
  });
}
// Compile the complete portable core graph (including Lithent SSR) as an edge bundle.
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: 'engine/server/core/handler.ts',
    outDir: 'dist/conformance',
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'core.mjs' } },
  },
  ssr: { noExternal: true, target: 'webworker' },
});
