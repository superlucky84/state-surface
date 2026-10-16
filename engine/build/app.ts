import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeModule,
  type ImportBinding,
  type IslandUse,
  type ModuleAnalysis,
} from './analyze.js';
import { SurfaceBuildError } from './diagnostics.js';
import { scanRoutes, type ScannedRoute } from './routeScanner.js';

export type Resolve = (source: string, importer: string) => Promise<string | undefined>;

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

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
        text => analyzeModule(text, file),
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
    const fail = (message: string): never => {
      throw new SurfaceBuildError(message, { file: importer, code, offset: use.offset });
    };
    const server = target.serverExports.has(use.binding.imported);
    const slotMode = use.slot?.mode;
    if (server && use.kind === 'island')
      fail(`<${use.local}> is a defineServerComponent and cannot be a client island.`);
    if (server && slotMode !== 'server')
      fail(`<Slot name="${use.slot!.name}">: defineServerComponent children need mode="server".`);
    if (target.usesSlot) fail(`<${use.local}> renders a <Slot>; Slots cannot be nested.`);
    const clientRendered =
      use.kind === 'island' || (slotMode !== 'server' && slotMode !== 'static');
    if (clientRendered && target.usesBoot)
      fail(`<${use.local}> is rendered on the client and cannot contain <Boot>.`);
    if (clientRendered && target.islands.length)
      fail(`<${use.local}> is rendered on the client and cannot contain islands.`);
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
        { file: importer, code, offset }
      );
  }

  /**
   * Scan pages and their reachable project modules. Returns the routes, the components
   * rendered on the client (componentId → file/export) and every analyzed file.
   */
  async app() {
    const routesDir = path.join(this.root, 'routes');
    const pages = await scanRoutes(routesDir);
    const client = new Map<string, { file: string; exportName: string }>();
    const files = new Set<string>();
    for (const page of pages) {
      const facts = await this.module(page.filePath);
      if (facts && !facts.hasDefaultExport)
        throw new SurfaceBuildError('Pages must default-export a page function.', {
          file: page.filePath,
          hint: 'export default async function Page(ctx: SurfaceContext) { … }',
        });
      const names = new Map<string, string>();
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
              { file }
            );
          names.set(slot.name, file);
        }
        for (const use of module.islands) {
          const target = await this.resolve(use.binding.source, file);
          if (!target) continue;
          const mode = use.slot?.mode;
          if (use.kind === 'island' || (mode !== 'server' && mode !== 'static'))
            client.set(this.componentId(target, use.binding), {
              file: target,
              exportName: use.binding.imported,
            });
        }
        for (const source of module.sources) {
          const target = await this.resolve(source, file);
          if (this.isProjectFile(target) && !seen.has(target)) queue.push(target);
        }
      }
    }
    return { pages, client, files };
  }
}

export type { ScannedRoute };
