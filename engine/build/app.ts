import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeModule,
  type ImportBinding,
  type IslandUse,
  type ModuleAnalysis,
  type SlotFacts,
} from './analyze.js';
import { SurfaceBuildError, atDefaultExport } from './diagnostics.js';
import { listFiles } from './fsUtils.js';
import { compileMdx, inMdxSource } from './mdx.js';
import { scanRoutes, type ScannedRoute } from './routeScanner.js';
import type { PagePlugin } from '../server/ssrRenderer.js';

export type Resolve = (source: string, importer: string) => Promise<string | undefined>;

/** A module export the server manifest imports (component or schema). */
export interface ExportRef {
  file: string;
  exportName: string;
}

/** One Slot of a page as the server sees it when projecting transitions (DESIGN 6.2). */
export interface PageSlotFacts extends Omit<SlotFacts, 'schema'> {
  componentId: string;
  component: ExportRef;
  schema?: ExportRef;
}

const SCRIPT = /\.(?:[cm]?[jt]sx?|mdx)$/;
// Vite's stylesheet languages (preprocessors need their package installed).
const CSS = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/;

/**
 * Analysis context bound to one plugin hook's resolver. Module facts are cached by absolute
 * file path in a cache shared across hooks; the dev server drops entries when files change.
 */
export type FactsCache = Map<string, Promise<ModuleAnalysis | undefined>>;

export class SurfaceAnalyzer {
  constructor(
    readonly root: string,
    private readonly engineDir: string,
    readonly resolve: Resolve,
    private readonly facts: FactsCache = new Map()
  ) {}

  /** Files whose analysis matters for this app: project sources, not packages or the engine. */
  isProjectFile(file: string | undefined): file is string {
    return (
      !!file &&
      path.isAbsolute(file) &&
      SCRIPT.test(file) &&
      !file.endsWith('.d.ts') &&
      !file.split(path.sep).includes('node_modules') &&
      !file.startsWith(this.engineDir + path.sep)
    );
  }

  module(file: string, code?: string): Promise<ModuleAnalysis | undefined> {
    if (code !== undefined) {
      const fresh = Promise.resolve(analyzeModule(code, file));
      this.facts.set(file, fresh);
      return fresh;
    }
    let cached = this.facts.get(file);
    if (!cached) {
      cached = readFile(file, 'utf8').then(
        async text => {
          if (!file.endsWith('.mdx')) return analyzeModule(text, file);
          const compiled = await compileMdx(text, file);
          try {
            return analyzeModule(compiled.code, file);
          } catch (error) {
            throw await inMdxSource(error, text, file, compiled);
          }
        },
        () => undefined
      );
      this.facts.set(file, cached);
      cached.catch(() => this.facts.delete(file));
    }
    return cached;
  }

  componentId(file: string, binding: ImportBinding) {
    return `${path.relative(this.root, file).split(path.sep).join('/')}#${binding.imported}`;
  }

  async resolveBinding(binding: ImportBinding, importer: string, code: string, offset: number) {
    const file = await this.resolve(binding.source, importer);
    if (!file)
      throw new SurfaceBuildError(`Cannot resolve "${binding.source}" for an island component.`, {
        file: importer,
        code,
        offset,
        hint: 'Islands and Slot children must be project modules the build can resolve; check the import path.',
      });
    return file;
  }

  /**
   * Cross-module rules for a component used as an island or Slot child. Rendering on the
   * client excludes Slots, islands and `<Boot>` inside the component; server components
   * only work as the child of a server Slot.
   */
  async checkUse(use: IslandUse, file: string, importer: string, code: string) {
    if (!this.isProjectFile(file)) return;
    const target = await this.module(file);
    if (!target) return;
    const fail = (message: string, hint: string): never => {
      throw new SurfaceBuildError(message, { file: importer, code, offset: use.offset, hint });
    };
    const server = target.serverExports.has(use.binding.imported);
    const slotMode = use.slot?.mode;
    if (server && use.kind === 'island')
      fail(
        `<${use.local}> is a defineServerComponent and cannot be a client island.`,
        'Use it as the child of <Slot mode="server">: its load runs on the server for every render.'
      );
    if (server && slotMode !== 'server')
      fail(
        `<Slot name="${use.slot!.name}">: defineServerComponent children need mode="server".`,
        'Add mode="server" to the Slot (and no client directive).'
      );
    if (target.usesSlot)
      fail(
        `<${use.local}> renders a <Slot>; Slots cannot be nested.`,
        'Slots belong to page or layout markup; move the inner <Slot> out of the component.'
      );
    const clientRendered = use.kind === 'island' || slotMode === 'client';
    if (clientRendered && target.usesBoot)
      fail(
        `<${use.local}> is rendered on the client and cannot contain <Boot>.`,
        'Put <Boot> in the page or layout markup.'
      );
    if (clientRendered && target.islands.length)
      fail(
        `<${use.local}> is rendered on the client and cannot contain islands.`,
        'A client-rendered component is one island: use the inner component as a plain element, or render it as its own island in the page.'
      );
  }

  async checkElement(
    local: string,
    binding: ImportBinding,
    importer: string,
    code: string,
    offset: number
  ) {
    const file = await this.resolve(binding.source, importer);
    if (!this.isProjectFile(file)) return;
    const target = await this.module(file);
    if (target?.serverExports.has(binding.imported))
      throw new SurfaceBuildError(
        `<${local}> is a defineServerComponent; use it as the child of <Slot mode="server">.`,
        {
          file: importer,
          code,
          offset,
          hint: 'Server components re-run load for every render, which only server Slots do.',
        }
      );
  }

  /**
   * Scan pages and their reachable project modules. Returns the routes, the components
   * rendered on the client (componentId → file/export) and every analyzed file.
   */
  /** `.mdx` content entries: part of every page that imports `state-surface/content`. */
  private async contentModules() {
    const dir = path.join(this.root, 'content');
    const files = await listFiles(dir).catch(() => [] as string[]);
    return files
      .filter(
        file =>
          file.endsWith('.mdx') &&
          !path
            .relative(dir, file)
            .split(path.sep)
            .some(part => part.startsWith('_') || part.startsWith('.'))
      )
      .sort();
  }

  async app() {
    const routesDir = path.join(this.root, 'routes');
    const pages = await scanRoutes(routesDir);
    // `engine/content.ts` in this repository, `lib/content.js` in the package.
    const contentModules = new Set(
      ['.ts', '.js'].map(ext => path.join(this.engineDir, 'content' + ext))
    );
    const content = await this.contentModules();
    const client = new Map<string, { file: string; exportName: string }>();
    const plugins = new Map<string, { file: string; exportName: string }>();
    const pagePlugins = new Map<string, PagePlugin[]>();
    const pageSlots = new Map<string, PageSlotFacts[]>();
    // DC-23: stylesheets imported anywhere in a page's module graph (CSS Modules included).
    const pageStyles = new Map<string, string[]>();
    const files = new Set<string>();
    for (const page of pages) {
      const facts = await this.module(page.filePath);
      if (facts && !facts.hasDefaultExport)
        throw new SurfaceBuildError('Pages must default-export a page function.', {
          ...(await atDefaultExport(page.filePath)),
          hint: 'export default async function Page(ctx: SurfaceContext) { … }',
        });
      const names = new Map<string, string>();
      const declared: PagePlugin[] = [];
      pagePlugins.set(page.filePath, declared);
      const slots: PageSlotFacts[] = [];
      pageSlots.set(page.filePath, slots);
      const styles: string[] = [];
      pageStyles.set(page.filePath, styles);
      const seen = new Set<string>();
      const queue = [page.filePath];
      while (queue.length) {
        const file = queue.shift()!;
        if (seen.has(file)) continue;
        seen.add(file);
        files.add(file);
        const module = await this.module(file);
        if (!module) continue;
        for (const slot of module.slots) {
          const owner = names.get(slot.name);
          if (owner && owner !== file)
            throw new SurfaceBuildError(
              `Slot name "${slot.name}" is declared in both ${path.relative(this.root, owner)} ` +
                `and ${path.relative(this.root, file)}, which render on page ${page.urlPattern}.`,
              {
                file,
                code: await readFile(file, 'utf8').catch(() => undefined),
                offset: slot.offset,
                hint: 'Rename one of them: transitions address each slot of a page by its unique name.',
              }
            );
          names.set(slot.name, file);
        }
        for (const use of module.islands) {
          const target = await this.resolve(use.binding.source, file);
          if (!target) continue;
          const componentId = this.componentId(target, use.binding);
          const component = { file: target, exportName: use.binding.imported };
          if (use.kind === 'island' || use.slot?.mode === 'client')
            client.set(componentId, component);
          if (use.slot) {
            const { schema, ...facts } = use.slot;
            slots.push({
              ...facts,
              componentId,
              component,
              ...(schema ? { schema: await this.schemaRef(module, file, schema.local) } : {}),
            });
          }
        }
        for (const use of module.plugins) {
          const target = await this.resolve(use.binding.source, file);
          const definition =
            target && (await this.module(target))?.pluginDefinitions.get(use.binding.imported);
          if (!target || !definition)
            throw new SurfaceBuildError(
              `\`${use.local}\` in \`plugins\` is not an exported definePlugin() from 'state-surface/client'.`,
              {
                file,
                offset: use.offset,
                code: await readFile(file, 'utf8').catch(() => undefined),
                hint: "Export it with export const x = definePlugin({ … }) (import { definePlugin } from 'state-surface/client') and import that binding.",
              }
            );
          const id = this.componentId(target, use.binding);
          plugins.set(id, { file: target, exportName: use.binding.imported });
          if (!declared.some(plugin => plugin.id === id)) declared.push({ id, ...definition });
        }
        for (const source of module.sources) {
          const target = await this.resolve(source, file);
          // `?inline`, `?url` and `?raw` imports are values, not page styles.
          if (target && CSS.test(target) && !source.includes('?') && !styles.includes(target))
            styles.push(target);
          if (target && contentModules.has(target))
            queue.push(...content.filter(mdx => !seen.has(mdx)));
          if (this.isProjectFile(target) && !seen.has(target)) queue.push(target);
        }
      }
    }
    return { pages, client, plugins, pagePlugins, pageSlots, pageStyles, files };
  }

  /** `schema={x}`: an imported binding or a module-level export of the declaring module. */
  private async schemaRef(module: ModuleAnalysis, file: string, local: string): Promise<ExportRef> {
    const binding = module.imports.get(local);
    if (binding && binding.imported !== '*') {
      const target = await this.resolve(binding.source, file);
      if (target) return { file: target, exportName: binding.imported };
    }
    const exported = module.exports.get(local);
    if (exported) return { file, exportName: exported };
    throw new SurfaceBuildError(`Cannot resolve schema \`${local}\`.`, {
      file,
      hint: 'Import the schema from a module the build can resolve, or export it from this module.',
    });
  }
}

export type { ScannedRoute };
