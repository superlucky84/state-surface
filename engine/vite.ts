import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig, Rollup } from 'vite';
import { actionTypes, scanTransitions } from './build/transitionScanner.js';
import { SurfaceAnalyzer, type ExportRef, type FactsCache } from './build/app.js';
import { transformSurface } from './build/transform.js';
import { SurfaceBuildError } from './build/diagnostics.js';
import { nodeListener } from './adapters/http.js';
import type { Adapter } from './adapters/types.js';

const VIRTUAL = 'virtual:state-surface/manifest';
const ISLANDS = 'virtual:state-surface/islands';
const PLUGINS = 'virtual:state-surface/plugins';
const ENTRY = 'virtual:state-surface/entry';
const ENGINE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_CLIENT = {
  loader: path.join(ENGINE_DIR, 'client/loader.ts'),
  runtime: path.join(ENGINE_DIR, 'client/runtime.ts'),
  bridge: path.join(ENGINE_DIR, 'client/lithentBridge.ts'),
  morph: path.join(ENGINE_DIR, 'client/morph.ts'),
  router: path.join(ENGINE_DIR, 'client/router.ts'),
};
const SERVER_ONLY_MARKERS = [
  path.join(ENGINE_DIR, 'serverOnly.ts'),
  path.join(ENGINE_DIR, 'serverOnly.browser.ts'),
];
type PluginContext = Pick<Rollup.PluginContext, 'resolve'>;

export interface SurfacePluginOptions {
  adapter?: Adapter;
  /** App entry run on every page before the engine (DC-18). Default `client/entry.ts`. */
  clientEntry?: string;
  /** Global stylesheets linked on every page. Default `client/styles.css` when present. */
  styles?: string[];
}

/** Server-only modules (DC-02): marker import, `*.server.*` files and Node builtins. */
function isServerOnly(id: string) {
  const file = id.split('?')[0];
  return (
    /\.server\.[cm]?[jt]sx?$/.test(file) ||
    SERVER_ONLY_MARKERS.includes(file) ||
    file.startsWith('node:') ||
    file.startsWith('__vite-browser-external')
  );
}

export function surface(options: SurfacePluginOptions = {}): Plugin {
  let config: ResolvedConfig;
  const facts: FactsCache = new Map();
  // Root secret for deferred-slot tokens and flash (IC-09) when SURFACE_SECRET is unset:
  // one per build (shared by every instance of that build) or per dev server.
  const secret = randomBytes(32).toString('base64url');
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
  const appEntryFile = (root: string) => {
    const file = path.resolve(root, options.clientEntry ?? 'client/entry.ts');
    return existsSync(file) ? file : undefined;
  };
  const styleFiles = (root: string) =>
    options.styles
      ? options.styles.map(file => path.resolve(root, file.replace(/^\//, '')))
      : [path.join(root, 'client/styles.css')].filter(file => existsSync(file));
  // Document paths are project-relative (manifest keys); dev serves files outside the root
  // through /@fs.
  const documentPath = (file: string) => {
    const relative = path.relative(config.root, file).split(path.sep).join('/');
    return config.command === 'serve' && relative.startsWith('..') ? '/@fs' + file : '/' + relative;
  };
  const isClient = (context: unknown) =>
    (context as { environment?: { config: { consumer?: string } } }).environment?.config
      .consumer === 'client';
  const adapter = options.adapter;
  return {
    name: 'state-surface',
    enforce: 'pre',
    config(user, env) {
      const base = {
        ssr: { noExternal: ['lithent'] },
        define: { __SURFACE_ADAPTER__: JSON.stringify(adapter?.name ?? 'node') },
      };
      if (env.command !== 'build' || env.isSsrBuild || user.build?.ssr) return base;
      // Client build inputs: engine loader (its runtime, bridge, component and plugin chunks
      // are dynamic imports), global styles and the app entry.
      const root = path.resolve(user.root ?? process.cwd());
      const existing = user.build?.rollupOptions?.input;
      const input: Record<string, string> =
        typeof existing === 'string'
          ? { main: existing }
          : Array.isArray(existing)
            ? Object.fromEntries(existing.map((file, i) => [`input${i}`, file]))
            : { ...(existing ?? {}) };
      input['surface-loader'] = ENGINE_CLIENT.loader;
      styleFiles(root).forEach((file, i) => (input[i ? `styles${i}` : 'styles'] = file));
      const entry = appEntryFile(root);
      if (entry) input['app-entry'] = entry;
      // The server writes modulepreload links per page (client:load chunks, action runtime),
      // so Vite's dynamic-import preload helper would only grow the loader.
      return {
        ...base,
        build: {
          rollupOptions: { input },
          ...(user.build?.modulePreload === undefined ? { modulePreload: false as const } : {}),
        },
      };
    },
    configResolved(resolved) {
      config = resolved;
    },
    resolveId(id, importer) {
      if (id === VIRTUAL) return '\0' + VIRTUAL;
      if (id === ISLANDS) return '\0' + ISLANDS;
      if (id === PLUGINS) return '\0' + PLUGINS;
      if (id === ENTRY || id === path.resolve(config.root, ENTRY)) return '\0' + ENTRY;
      // Dev reports server-only imports immediately; builds report the full chain in buildEnd.
      // Vitest's DOM environments are "client" too but mix server and browser code on purpose.
      if (
        config.command === 'serve' &&
        !process.env.VITEST &&
        importer &&
        // Virtual modules watch the analyzed page graph (addWatchFile); those are not imports.
        !importer.startsWith('\0virtual:state-surface/') &&
        isClient(this) &&
        (id === 'state-surface/server-only' ||
          id.startsWith('node:') ||
          /\.server(\.[cm]?[jt]sx?)?$/.test(id))
      )
        forRollup(
          new SurfaceBuildError(
            `"${id}" is server-only and cannot be imported into the browser bundle.`,
            { file: importer }
          )
        );
    },
    buildEnd(error) {
      if (error || config.command !== 'build' || !isClient(this)) return;
      const chains: string[] = [];
      for (const id of this.getModuleIds()) {
        if (!isServerOnly(id)) continue;
        chains.push(importChain(this, id, config.root).join(' → '));
      }
      if (chains.length)
        forRollup(
          new SurfaceBuildError(
            `Server-only modules are reachable from the browser bundle:\n  ${chains.join('\n  ')}`,
            {
              hint:
                'Move the server code behind a server Slot (defineServerComponent) or a ' +
                'transition, or pass the data as public props.',
            }
          )
        );
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
      if (![VIRTUAL, ISLANDS, PLUGINS].some(name => id === '\0' + name)) return;
      const root = config.root;
      const app = await analyzerFor(this).app().catch(forRollup);
      analyzed = app.files;
      for (const file of app.files) this.addWatchFile(file);

      if (id === '\0' + ISLANDS || id === '\0' + PLUGINS) {
        // One dynamic chunk per client component / plugin; shared code (Lithent, engine)
        // becomes common chunks.
        const entries = [...(id === '\0' + ISLANDS ? app.client : app.plugins)].sort(([a], [b]) =>
          a.localeCompare(b)
        );
        return `export default {${entries
          .map(
            ([key, c]) =>
              `${JSON.stringify(key)}: () => import(${JSON.stringify(c.file)}).then(m => m[${JSON.stringify(c.exportName)}])`
          )
          .join(',\n')}};`;
      }

      // DC-16 ③: transitions/**/*.ts, registered under their path.
      const transitions = await scanTransitions(path.join(root, 'transitions')).catch(forRollup);
      for (const transition of transitions) this.addWatchFile(transition.filePath);
      await writeActionTypes(root, transitions);
      const entry = appEntryFile(root);
      const document = {
        styles: styleFiles(root).map(documentPath),
        ...(entry ? { appEntry: documentPath(entry) } : {}),
        engine: {
          loader: documentPath(ENGINE_CLIENT.loader),
          runtime: documentPath(ENGINE_CLIENT.runtime),
          bridge: documentPath(ENGINE_CLIENT.bridge),
          morph: documentPath(ENGINE_CLIENT.morph),
          router: documentPath(ENGINE_CLIENT.router),
        },
      };
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
      // The client asset manifest identifies the deployment; dev servers get a random id.
      const buildId =
        config.command === 'build' && Object.keys(assets).length
          ? createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16)
          : `dev-${randomBytes(6).toString('hex')}`;
      // Page manifests (DESIGN 6.2): server slots import their component, external slots
      // their schema. Everything else is plain data.
      const modules = new Map<string, string>();
      const ref = ({ file, exportName }: ExportRef) => {
        if (!modules.has(file)) modules.set(file, `m${modules.size}`);
        return `${modules.get(file)}[${JSON.stringify(exportName)}]`;
      };
      const components = new Map<string, string>();
      const pages = app.pages.map(route => {
        const id = path
          .relative(path.join(root, 'routes'), route.filePath)
          .split(path.sep)
          .join('/')
          .replace(/\.tsx$/, '');
        const slots = (app.pageSlots.get(route.filePath) ?? []).map(slot => {
          const { component, schema, name, ...facts } = slot;
          if (slot.mode === 'server') components.set(slot.componentId, ref(component));
          const data = JSON.stringify(facts).slice(1, -1);
          return `${JSON.stringify(name)}:{${data}${schema ? `,schema:${ref(schema)}` : ''}}`;
        });
        return `{id:${JSON.stringify(id)},slots:{${slots.join(',')}}}`;
      });
      return [
        "import { defineManifest } from 'state-surface/server';",
        "import { configureAssets } from 'state-surface/internal/assets';",
        "import { setBasePath } from 'state-surface/internal/basePath';",
        ...app.pages.map((r, i) => `import * as route${i} from ${JSON.stringify(r.filePath)};`),
        ...transitions.map(
          (transition, i) => `import transition${i} from ${JSON.stringify(transition.filePath)};`
        ),
        ...[...modules].map(
          ([file, local]) => `import * as ${local} from ${JSON.stringify(file)};`
        ),
        `setBasePath(${JSON.stringify(base)}); configureAssets(${JSON.stringify(assets)});`,
        `export default defineManifest({basePath:${JSON.stringify(base)},buildId:${JSON.stringify(buildId)},secret:${JSON.stringify(secret)},assets:${JSON.stringify(assets)},document:${JSON.stringify(document)},components:{${[...components].map(([id, value]) => `${JSON.stringify(id)}:${value}`).join(',')}},routes:[${app.pages.map((r, i) => `{pattern:${JSON.stringify(r.urlPattern)},module:route${i},plugins:${JSON.stringify(app.pagePlugins.get(r.filePath) ?? [])},page:${pages[i]}}`).join(',')}],transitions:{${transitions.map((transition, i) => `${JSON.stringify(transition.name)}:transition${i}`).join(',')}}});`,
      ].join('\n');
    },
    async transform(code, id) {
      if (!/\.[jt]sx$/.test(id.split('?')[0]) || id.startsWith('\0')) return;
      const file = id.split('?')[0];
      const analyzer = analyzerFor(this);
      if (!analyzer.isProjectFile(file)) return;
      return transformSurface(code, file, analyzer).catch(forRollup);
    },
    async buildStart() {
      // Editors and tsc read the action type map before any manifest is generated.
      await writeActionTypes(
        config.root,
        await scanTransitions(path.join(config.root, 'transitions')).catch(forRollup)
      );
    },
    configureServer(server) {
      const changed = (file: string) => {
        facts.delete(file);
        const transitionsDir = path.join(config.root, 'transitions');
        const graphChanged =
          analyzed.has(file) ||
          file.startsWith(path.join(config.root, 'routes')) ||
          file.startsWith(transitionsDir + path.sep);
        if (!graphChanged) return;
        if (file.startsWith(transitionsDir + path.sep))
          void scanTransitions(transitionsDir)
            .then(list => writeActionTypes(config.root, list))
            .catch(error => config.logger.error(String(error)));
        for (const id of ['\0' + VIRTUAL, '\0' + ISLANDS, '\0' + PLUGINS]) {
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
  };
}

/** Write `.state-surface/actions.d.ts` when its content changes (DC-22 ⑤). */
async function writeActionTypes(
  root: string,
  transitions: Awaited<ReturnType<typeof scanTransitions>>
) {
  const file = path.join(root, '.state-surface/actions.d.ts');
  const content = actionTypes(root, transitions);
  if ((await readFile(file, 'utf8').catch(() => undefined)) === content) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

/** Shortest importer path from an entry to `id`, as project-relative names. */
function importChain(context: Rollup.PluginContext, id: string, root: string): string[] {
  const label = (module: string) =>
    SERVER_ONLY_MARKERS.includes(module)
      ? 'state-surface/server-only'
      : module.startsWith('\0')
        ? module.slice(1)
        : path.isAbsolute(module)
          ? path.relative(root, module).split(path.sep).join('/')
          : module;
  const previous = new Map<string, string | undefined>([[id, undefined]]);
  const queue = [id];
  let entry: string | undefined;
  while (queue.length && !entry) {
    const current = queue.shift()!;
    const info = context.getModuleInfo(current);
    const importers = [...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])];
    if (info?.isEntry || !importers.length) entry = current;
    for (const importer of importers)
      if (!previous.has(importer)) {
        previous.set(importer, current);
        queue.push(importer);
      }
  }
  const chain: string[] = [];
  for (let at: string | undefined = entry ?? id; at; at = previous.get(at)) chain.push(label(at));
  // Start at the island/plugin module: loader → islands map is engine plumbing.
  const start = chain.findIndex(name => name === ISLANDS || name === PLUGINS);
  return start >= 0 && start < chain.length - 1 ? chain.slice(start + 1) : chain;
}

/** Rollup prefixes hook errors with the plugin name; drop ours to avoid printing it twice. */
function forRollup(error: unknown): never {
  if (error instanceof SurfaceBuildError)
    error.message = error.message.replace(/^\[state-surface\] /, '');
  throw error;
}
