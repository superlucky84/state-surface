import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { scanRoutes } from './build/routeScanner.js';
import { listFiles, hasSegment, isModuleFile } from './build/fsUtils.js';
import { nodeListener } from './adapters/http.js';
import type { Adapter } from './adapters/types.js';

const VIRTUAL = 'virtual:state-surface/manifest';
const INTERNAL = '\0' + VIRTUAL;
const ENTRY = 'virtual:state-surface/entry';
export function surface(options: { adapter?: Adapter } = {}): Plugin {
  let config: ResolvedConfig;
  const adapter = options.adapter;
  return {
    name: 'state-surface',
    configResolved(resolved) {
      config = resolved;
    },
    resolveId(id) {
      if (id === VIRTUAL) return INTERNAL;
      if (id === ENTRY || id === path.resolve(config.root, ENTRY)) return '\0' + ENTRY;
    },
    async load(id) {
      if (id === '\0' + ENTRY) {
        const name = adapter?.name ?? 'node';
        if (name === 'cloudflare')
          return `import manifest from '${VIRTUAL}';import {worker} from 'state-surface/adapters/cloudflare';export default worker({manifest});`;
        if (name === 'express')
          return `import manifest from '${VIRTUAL}';import express from 'express';import {surface} from 'state-surface/adapters/express';const app=express();app.use(surface({manifest}));app.listen(Number(process.env.PORT??3000));`;
        return `import manifest from '${VIRTUAL}';import {serve} from 'state-surface/adapters/${name}';serve({manifest});`;
      }
      if (id !== INTERNAL) return;
      const root = config.root;
      const routes = await scanRoutes(path.join(root, 'routes'));
      const files = (await listFiles(path.join(root, 'routes'))).filter(isModuleFile).sort();
      const transitions = files.filter(file => hasSegment(file, 'transitions'));
      const templates = files.filter(
        file => hasSegment(file, 'templates') && file.endsWith('.tsx')
      );
      for (const file of [...routes.map(r => r.filePath), ...transitions, ...templates])
        this.addWatchFile(file);
      let assets = {};
      if (config.command === 'build') {
        try {
          assets = JSON.parse(
            await readFile(path.join(root, 'dist/client/.vite/manifest.json'), 'utf8')
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      const base = config.base === '/' ? '' : config.base.replace(/\/$/, '');
      return [
        "import { defineManifest } from 'state-surface/server';",
        "import { configureAssets } from 'state-surface/internal/assets';",
        "import { setBasePath } from 'state-surface/internal/basePath';",
        ...routes.map((r, i) => `import route${i} from ${JSON.stringify(r.filePath)};`),
        ...transitions.map((file, i) => `import transition${i} from ${JSON.stringify(file)};`),
        ...templates.map((file, i) => `import template${i} from ${JSON.stringify(file)};`),
        `setBasePath(${JSON.stringify(base)}); configureAssets(${JSON.stringify(assets)});`,
        `export default defineManifest({basePath:${JSON.stringify(base)},assets:${JSON.stringify(assets)},routes:[${routes.map((r, i) => `{pattern:${JSON.stringify(r.urlPattern)},module:route${i}}`).join(',')}],transitions:[${transitions.map((_, i) => `transition${i}`).join(',')}],templates:[${templates.map((_, i) => `template${i}`).join(',')}]});`,
      ].join('\n');
    },
    configureServer(server) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          try {
            const { default: manifest } = await server.ssrLoadModule(VIRTUAL);
            const { createHandler } = await server.ssrLoadModule('state-surface/server');
            const handler = createHandler({ manifest, development: true });
            await nodeListener(handler)(req, res);
          } catch (error) {
            server.ssrFixStacktrace(error as Error);
            next(error);
          }
        });
        server.watcher.on('add', invalidate);
        server.watcher.on('unlink', invalidate);
        function invalidate(file: string) {
          if (!file.startsWith(path.join(config.root, 'routes'))) return;
          const mod = server.moduleGraph.getModuleById(INTERNAL);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      };
    },
    config() {
      return {
        ssr: { noExternal: ['lithent'] },
        define: { __SURFACE_ADAPTER__: JSON.stringify(adapter?.name ?? 'node') },
      };
    },
  };
}
