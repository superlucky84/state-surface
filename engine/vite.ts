import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig, Rollup } from 'vite';
import { listFiles, hasSegment, isModuleFile } from './build/fsUtils.js';
import { SurfaceAnalyzer, type FactsCache } from './build/app.js';
import { transformSurface } from './build/transform.js';
import { nodeListener } from './adapters/http.js';
import type { Adapter } from './adapters/types.js';

const VIRTUAL = 'virtual:state-surface/manifest';
const ISLANDS = 'virtual:state-surface/islands';
const ENTRY = 'virtual:state-surface/entry';
const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url));
type PluginContext = Pick<Rollup.PluginContext, 'resolve'>;

export interface SurfacePluginOptions {
  adapter?: Adapter;
  /**
   * Engine-managed document tags. Defaults to `client/main.ts` (engine entry) and
   * `client/styles.css` when those files exist.
   */
  client?: { entry?: string; styles?: string[] };
}

async function exists(file: string) {
  return access(file).then(
    () => true,
    () => false
  );
}

export function surface(options: SurfacePluginOptions = {}): Plugin {
  let config: ResolvedConfig;
  const facts: FactsCache = new Map();
  let analyzed = new Set<string>();
  // Each hook (and Vite environment) resolves with its own plugin context.
  const analyzerFor = (context: PluginContext) =>
    new SurfaceAnalyzer(
      config.root,
      ENGINE_DIR,
      async (source, importer) => {
        const resolved = await context.resolve(source, importer, { skipSelf: true });
        if (!resolved || resolved.external || resolved.id.startsWith('\0')) return undefined;
        return resolved.id.split('?')[0];
      },
      facts
    );
  const adapter = options.adapter;
  return {
    name: 'state-surface',
    enforce: 'pre',
    configResolved(resolved) {
      config = resolved;
    },
    resolveId(id) {
      if (id === VIRTUAL) return '\0' + VIRTUAL;
      if (id === ISLANDS) return '\0' + ISLANDS;
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
      if (id !== '\0' + VIRTUAL && id !== '\0' + ISLANDS) return;
      const root = config.root;
      const app = await analyzerFor(this).app();
      analyzed = app.files;
      for (const file of app.files) this.addWatchFile(file);

      if (id === '\0' + ISLANDS) {
        // Stage 2 keeps every client component eager; dynamic chunks replace this map.
        const entries = [...app.client].sort(([a], [b]) => a.localeCompare(b));
        return [
          ...entries.map(([, c], i) => `import * as m${i} from ${JSON.stringify(c.file)};`),
          `export default {${entries
            .map(([cid, c], i) => `${JSON.stringify(cid)}: m${i}[${JSON.stringify(c.exportName)}]`)
            .join(',')}};`,
        ].join('\n');
      }

      const files = (await listFiles(path.join(root, 'routes'))).filter(isModuleFile).sort();
      const transitions = files.filter(file => hasSegment(file, 'transitions'));
      for (const file of transitions) this.addWatchFile(file);
      const entry =
        options.client?.entry ??
        ((await exists(path.join(root, 'client/main.ts'))) ? '/client/main.ts' : undefined);
      const styles =
        options.client?.styles ??
        ((await exists(path.join(root, 'client/styles.css'))) ? ['/client/styles.css'] : []);
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
        ...app.pages.map((r, i) => `import * as route${i} from ${JSON.stringify(r.filePath)};`),
        ...transitions.map((file, i) => `import transition${i} from ${JSON.stringify(file)};`),
        `setBasePath(${JSON.stringify(base)}); configureAssets(${JSON.stringify(assets)});`,
        `export default defineManifest({basePath:${JSON.stringify(base)},assets:${JSON.stringify(assets)},document:${JSON.stringify({ entry, styles })},routes:[${app.pages.map((r, i) => `{pattern:${JSON.stringify(r.urlPattern)},module:route${i}}`).join(',')}],transitions:[${transitions.map((_, i) => `transition${i}`).join(',')}]});`,
      ].join('\n');
    },
    async transform(code, id) {
      if (!/\.[jt]sx$/.test(id.split('?')[0]) || id.startsWith('\0')) return;
      const file = id.split('?')[0];
      const analyzer = analyzerFor(this);
      if (!analyzer.isProjectFile(file)) return;
      return transformSurface(code, file, analyzer);
    },
    configureServer(server) {
      const changed = (file: string) => {
        facts.delete(file);
        const graphChanged =
          analyzed.has(file) || file.startsWith(path.join(config.root, 'routes'));
        if (!graphChanged) return;
        for (const id of ['\0' + VIRTUAL, '\0' + ISLANDS]) {
          const mod = server.moduleGraph.getModuleById(id);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', changed);
      server.watcher.on('change', changed);
      server.watcher.on('unlink', changed);
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
