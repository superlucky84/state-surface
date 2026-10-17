import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig, Rollup } from 'vite';
import { actionTypes, scanTransitions } from './build/transitionScanner.js';
import { SurfaceAnalyzer, type ExportRef, type FactsCache } from './build/app.js';
import { transformSurface } from './build/transform.js';
import { SurfaceBuildError } from './build/diagnostics.js';
import { nodeListener } from './adapters/http.js';
import { scanRoutes } from './build/routeScanner.js';
import { prerender } from './build/prerender.js';
import { loadContent } from './build/content.js';
import { compileMdx } from './build/mdx.js';
import {
  IMAGE_FILE,
  IMAGE_TYPES,
  checkImageOptions,
  imageConfig,
  imageModule,
  type ImageOptions,
} from './build/images.js';
import { createImageService } from './images/service.js';
import type { Adapter } from './adapters/types.js';
import type { CollectionConfig, RawEntry } from './content/types.js';

const VIRTUAL = 'virtual:state-surface/manifest';
const ISLANDS = 'virtual:state-surface/islands';
const PLUGINS = 'virtual:state-surface/plugins';
const ENTRY = 'virtual:state-surface/entry';
const PRERENDER = 'virtual:state-surface/prerender';
const CONTENT = 'virtual:state-surface/content';
const CONTENT_CONFIGS = ['ts', 'mts', 'js', 'mjs'].map(ext => `content/config.${ext}`);
// Set while the plugin builds the prerender bundle (no nested prerendering, same secret).
const PRERENDER_BUILD = 'STATE_SURFACE_PRERENDER_BUILD';
const BUILD_SECRET = 'STATE_SURFACE_BUILD_SECRET';
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
  /**
   * Prerender every page by default (DC-24 ①); pages opt out with
   * `export const prerender = false`. Default: pages opt in with `prerender = true`.
   */
  prerender?: boolean;
  /**
   * Language paths (DC-24 ⑤): pages under `routes/[lang]/` answer `/en/…`, `/ko/…`; paths
   * without a language redirect (cookie → Accept-Language → `defaultLocale`).
   */
  i18n?: { locales: string[]; defaultLocale: string };
  /** Public origin for hreflang/canonical links in prerendered HTML (`https://example.com`). */
  site?: string;
  /** Image optimization (DC-26): srcset widths, extra formats, allowed remote hosts. */
  images?: ImageOptions;
}

/** Pages that may prerender: the option, or a `prerender` export (its value decides later). */
async function mayPrerender(root: string, all: boolean) {
  if (all) return true;
  const routes = await scanRoutes(path.join(root, 'routes')).catch(() => []);
  for (const route of routes) {
    const code = await readFile(route.filePath, 'utf8');
    if (/export\s+(?:const|let|var)\s+prerender\b|export\s*\{[^}]*\bprerender\b/.test(code))
      return true;
  }
  return false;
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
  checkImageOptions(options.images);
  let config: ResolvedConfig;
  const facts: FactsCache = new Map();
  // Root secret for deferred-slot tokens and flash (IC-09) when SURFACE_SECRET is unset:
  // one per build (shared by every instance of that build) or per dev server.
  const secret = process.env[BUILD_SECRET] ?? randomBytes(32).toString('base64url');
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
  // Encoded variants are reused across builds and dev restarts.
  const imageCache = () => path.join(config.root, 'node_modules/.state-surface/images');
  const images = () =>
    imageConfig(options.images, {
      adapter: adapter?.name ?? 'node',
      prerender: !!process.env[PRERENDER_BUILD],
    });
  const basePath = () => (config.base === '/' ? '' : config.base.replace(/\/$/, ''));
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
      if (id === PRERENDER || id === path.resolve(config.root, PRERENDER)) return '\0' + PRERENDER;
      if (id === CONTENT) return '\0' + CONTENT;
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
      // DC-26: `import hero from './hero.png'` is an ImageAsset (size + variants).
      if (
        IMAGE_FILE.test(id) &&
        !id.startsWith('\0') &&
        path.isAbsolute(id) &&
        !id.split(path.sep).includes('node_modules')
      ) {
        this.addWatchFile(id);
        return imageModule(id, {
          command: config.command,
          root: config.root,
          base: basePath(),
          clientDir: path.join(config.root, 'dist/client'),
          cacheDir: imageCache(),
          config: images(),
        }).catch(forRollup);
      }
      if (id === '\0' + CONTENT) {
        const content = await contentModule(config).catch(forRollup);
        for (const file of content.files) this.addWatchFile(file);
        return content.code;
      }
      if (id === '\0' + PRERENDER)
        return `export { default as manifest } from '${VIRTUAL}';export { createHandler, isPrerendered, staticParams } from 'state-surface/internal/prerender';`;
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
        "import { configureImages } from 'state-surface/internal/images';",
        ...app.pages.map((r, i) => `import * as route${i} from ${JSON.stringify(r.filePath)};`),
        ...transitions.map(
          (transition, i) => `import transition${i} from ${JSON.stringify(transition.filePath)};`
        ),
        ...[...modules].map(
          ([file, local]) => `import * as ${local} from ${JSON.stringify(file)};`
        ),
        `setBasePath(${JSON.stringify(base)}); configureAssets(${JSON.stringify(assets)}); configureImages(${JSON.stringify(images())});`,
        `export default defineManifest({${options.prerender ? 'prerender:true,' : ''}${options.i18n ? `i18n:${JSON.stringify(options.i18n)},` : ''}${options.site ? `site:${JSON.stringify(options.site)},` : ''}images:${JSON.stringify(images())},basePath:${JSON.stringify(base)},buildId:${JSON.stringify(buildId)},secret:${JSON.stringify(secret)},assets:${JSON.stringify(assets)},document:${JSON.stringify(document)},components:{${[...components].map(([id, value]) => `${JSON.stringify(id)}:${value}`).join(',')}},routes:[${app.pages.map((r, i) => `{pattern:${JSON.stringify(r.urlPattern)},module:route${i},plugins:${JSON.stringify(app.pagePlugins.get(r.filePath) ?? [])},page:${pages[i]}}`).join(',')}],transitions:{${transitions.map((transition, i) => `${JSON.stringify(transition.name)}:transition${i}`).join(',')}}});`,
      ].join('\n');
    },
    async transform(code, id) {
      if (!/\.(?:[jt]sx|mdx)$/.test(id.split('?')[0]) || id.startsWith('\0')) return;
      const file = id.split('?')[0];
      const analyzer = analyzerFor(this);
      if (!analyzer.isProjectFile(file)) return;
      if (file.endsWith('.mdx')) return transformMdx(code, file, analyzer).catch(forRollup);
      return transformSurface(code, file, analyzer).catch(forRollup);
    },
    /**
     * DC-24 ④: after the server build, build a prerender bundle with the same configuration
     * (the server bundle stays as configured) and render the prerendered pages with it into
     * `dist/client/<path>/index.html`.
     */
    async closeBundle(error?: Error) {
      if (
        error ||
        config.command !== 'build' ||
        !config.build.ssr ||
        isClient(this) ||
        process.env.VITEST ||
        process.env[PRERENDER_BUILD]
      )
        return;
      if (!(await mayPrerender(config.root, !!options.prerender))) return;
      const outDir = path.join(config.cacheDir, '..', '.state-surface', 'prerender');
      const inline = config.inlineConfig;
      const { build } = await import('vite');
      const previous = { build: process.env[PRERENDER_BUILD], secret: process.env[BUILD_SECRET] };
      process.env[PRERENDER_BUILD] = '1';
      process.env[BUILD_SECRET] = secret;
      try {
        await build({
          ...inline,
          logLevel: 'warn',
          build: {
            ...inline.build,
            ssr: PRERENDER,
            outDir,
            emptyOutDir: true,
            sourcemap: true,
            minify: false,
            copyPublicDir: false,
            rollupOptions: {
              ...inline.build?.rollupOptions,
              output: { entryFileNames: 'prerender.mjs', format: 'es' },
            },
          },
          ssr: { ...inline.ssr, target: 'node' },
        });
      } finally {
        for (const [key, value] of [
          [PRERENDER_BUILD, previous.build],
          [BUILD_SECRET, previous.secret],
        ] as const)
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
      }
      try {
        const pages = await prerender(path.join(outDir, 'prerender.mjs'), {
          root: config.root,
          engineDir: ENGINE_DIR,
          clientDir: path.join(config.root, 'dist/client'),
          env: process.env,
          images: createImageService({ cacheDir: imageCache() }),
          warn: message => config.logger.warn(`[state-surface] ${message}`),
        });
        if (pages.length)
          config.logger.info(
            `[state-surface] prerendered ${pages.length} page${pages.length === 1 ? '' : 's'}`
          );
      } catch (failure) {
        forRollup(failure);
      } finally {
        await rm(outDir, { recursive: true, force: true });
      }
    },
    async buildStart() {
      // Editors and tsc read the action and collection type maps before any manifest is
      // generated.
      await writeActionTypes(
        config.root,
        await scanTransitions(path.join(config.root, 'transitions')).catch(forRollup)
      );
      await writeContentTypes(config.root);
      await writeGenerated(config.root, 'images.d.ts', IMAGE_TYPES);
    },
    configureServer(server) {
      const contentDir = path.join(config.root, 'content') + path.sep;
      const changed = (file: string) => {
        facts.delete(file);
        // DC-25: content files are build input; a change rebuilds the content module and
        // reloads the page.
        if (file.startsWith(contentDir)) {
          void writeContentTypes(config.root).catch(error => config.logger.error(String(error)));
          for (const id of ['\0' + CONTENT, '\0' + VIRTUAL]) {
            const mod = server.moduleGraph.getModuleById(id);
            if (mod) server.moduleGraph.invalidateModule(mod);
          }
          server.ws.send({ type: 'full-reload' });
          return;
        }
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
            const handler = createHandler({
              manifest,
              development: true,
              images: createImageService({ root: config.root, cacheDir: imageCache() }),
            });
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

/** The content config file, if the project has one. */
const contentConfig = (root: string) =>
  CONTENT_CONFIGS.map(file => path.join(root, file)).find(file => existsSync(file));

/**
 * `virtual:state-surface/content` (DC-25): every collection parsed and validated, as data.
 * `.mdx` entries import their compiled module. Dev reports parity problems as warnings.
 */
async function contentModule(config: ResolvedConfig) {
  const root = config.root;
  const file = contentConfig(root);
  if (!file) return { code: 'export default {};', files: [] as string[] };
  const { runnerImport } = await import('vite');
  // The config may import `state-surface/content` for defineCollection: that resolves to the
  // definition helper, not to this module.
  const { module, dependencies } = await runnerImport<{
    collections?: Record<string, CollectionConfig>;
  }>(file, {
    root,
    configFile: false,
    logLevel: 'error',
    resolve: {
      alias: [
        {
          find: /^state-surface\/content$/,
          replacement: path.join(ENGINE_DIR, 'content/define.ts'),
        },
      ],
    },
  });
  const collections = module.collections;
  if (!collections || typeof collections !== 'object')
    throw new SurfaceBuildError('content/config.ts must export `collections`.', {
      file: path.relative(root, file),
      hint: 'export const collections = { guides: defineCollection({ schema }) };',
    });
  const result = await loadContent({
    root,
    collections,
    parity: config.command === 'serve' ? 'warn' : 'error',
    mdxHeadings: async (mdx, source) => (await compileMdx(source, mdx)).headings,
  });
  for (const warning of result.warnings) config.logger.warn(`[state-surface] ${warning}`);
  const imports: string[] = [];
  const relative = (target: string) => path.relative(root, target).split(path.sep).join('/');
  const entry = (raw: RawEntry) => {
    const { module: _module, ...rest } = raw;
    const json = JSON.stringify({ ...rest, file: relative(raw.file) });
    if (raw.kind !== 'mdx') return json;
    const local = `mdx${imports.length}`;
    imports.push(`import * as ${local} from ${JSON.stringify(raw.file)};`);
    return `{...${json},module:${local}}`;
  };
  const body = Object.entries(result.collections).map(([name, entries]) => {
    const locales = collections[name].i18n?.locales;
    return `${JSON.stringify(name)}:{${locales ? `locales:${JSON.stringify(locales)},` : ''}entries:[${entries.map(entry).join(',')}]}`;
  });
  return {
    code: `${imports.join('\n')}\nexport default {${body.join(',\n')}};`,
    files: [file, ...dependencies.filter(dep => path.isAbsolute(dep)), ...result.files],
  };
}

/**
 * `.mdx` → JSX (MDX) → call-site transform (islands) → JS. MDX documents render inside page
 * markup: islands are allowed, Slots and `<Boot>` belong to pages.
 */
async function transformMdx(source: string, file: string, analyzer: SurfaceAnalyzer) {
  const { code } = await compileMdx(source, file);
  const surfaced = await transformSurface(code, file, analyzer);
  const analysis = await analyzer.module(file);
  if (analysis?.slots.length || analysis?.usesBoot)
    throw new SurfaceBuildError(
      `${analysis.usesBoot ? '<Boot>' : '<Slot>'} cannot be used in .mdx content; put it in the page.`,
      { file }
    );
  const { transformWithEsbuild } = await import('vite');
  const output = await transformWithEsbuild(surfaced?.code ?? code, file, {
    loader: 'jsx',
    jsx: 'automatic',
    jsxImportSource: 'lithent',
    sourcemap: true,
  });
  return { code: output.code, map: output.map };
}

/** Write `.state-surface/content.d.ts`: collection names and data types from the config. */
async function writeContentTypes(root: string) {
  const config = contentConfig(root);
  const target = config
    ? path
        .relative(path.join(root, '.state-surface'), config)
        .split(path.sep)
        .join('/')
        .replace(/\.[cm]?[jt]s$/, '')
    : undefined;
  const content = [
    '// Generated by state-surface from content/config.ts. Do not edit.',
    ...(target
      ? [`type ConfigCollections = typeof import(${JSON.stringify(target)})['collections'];`]
      : []),
    '',
    'declare global {',
    '  namespace StateSurface {',
    target
      ? '    interface Collections extends ConfigCollections {}'
      : '    interface Collections {}',
    '  }',
    '}',
    '',
    'export {};',
    '',
  ].join('\n');
  const file = path.join(root, '.state-surface/content.d.ts');
  if ((await readFile(file, 'utf8').catch(() => undefined)) === content) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

/** Write a `.state-surface/` file when its content changes. */
async function writeGenerated(root: string, name: string, content: string) {
  const file = path.join(root, '.state-surface', name);
  if ((await readFile(file, 'utf8').catch(() => undefined)) === content) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
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
