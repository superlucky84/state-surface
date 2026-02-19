import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerTemplate } from '../shared/templateRegistry.js';
import type { TemplateModule } from '../shared/templateRegistry.js';
import { registerTransition } from './transition.js';
import type { TransitionModule } from './transition.js';
import { listFiles, isModuleFile, hasSegment } from './fsUtils.js';

type BootstrapOptions = {
  rootDir?: string;
  routesDir?: string;
  transitionsDir?: string;
  templatesDir?: string;
};

export async function bootstrapServer(options: BootstrapOptions = {}) {
  const rootDir = options.rootDir ?? resolveRootDir();
  const routesDir = options.routesDir ?? path.join(rootDir, 'routes');
  const transitionsDir = options.transitionsDir ?? routesDir;
  const templatesDir = options.templatesDir ?? routesDir;

  await registerTransitionsFromDir(transitionsDir);
  await registerTemplatesFromDir(templatesDir);
}

function resolveRootDir(): string {
  try {
    return fileURLToPath(new URL('../..', import.meta.url));
  } catch {
    return process.cwd();
  }
}

async function registerTransitionsFromDir(dir: string) {
  const modules = await loadModules(
    dir,
    'transitions',
    file => isModuleFile(file) && hasSegment(file, 'transitions')
  );
  for (const mod of modules) {
    const transition = extractTransition(mod);
    registerTransition(transition.name, transition.handler);
  }
}

async function registerTemplatesFromDir(dir: string) {
  const modules = await loadModules(
    dir,
    'templates',
    file => isModuleFile(file) && file.endsWith('.tsx') && hasSegment(file, 'templates')
  );
  for (const mod of modules) {
    const template = extractTemplate(mod);
    registerTemplate(template.name, template.template);
  }
}

function extractTransition(mod: any): TransitionModule {
  const candidate = mod?.default ?? mod?.transition;
  if (candidate?.name && candidate?.handler) return candidate as TransitionModule;
  if (mod?.name && mod?.handler) return { name: mod.name, handler: mod.handler };
  throw new Error('Transition module must export { name, handler } as default or named export');
}

function extractTemplate(mod: any): TemplateModule {
  const candidate = mod?.default ?? mod?.template;
  if (candidate?.name && candidate?.template) return candidate as TemplateModule;
  if (mod?.name && mod?.template) return { name: mod.name, template: mod.template };
  throw new Error('Template module must export { name, template } as default or named export');
}

async function loadModules(
  dir: string,
  kind: 'transitions' | 'templates',
  filter: (file: string) => boolean
): Promise<any[]> {
  const globbed = loadModulesFromGlob(kind, filter);
  if (globbed) return globbed;

  const files = await listFiles(dir);
  const modules = [];
  for (const file of files.filter(filter).sort()) {
    const url = pathToFileURL(file).href;
    modules.push(await import(url));
  }
  return modules;
}

function loadModulesFromGlob(
  kind: 'transitions' | 'templates',
  filter: (file: string) => boolean
): any[] | null {
  try {
    const entries =
      kind === 'transitions'
        ? Object.entries(
            import.meta.glob('/routes/**/transitions/**/*.{ts,js,mjs}', { eager: true })
          )
        : Object.entries(import.meta.glob('/routes/**/templates/**/*.tsx', { eager: true }));
    return entries.filter(([file]) => filter(file)).map(([, mod]) => mod);
  } catch {
    return null;
  }
}
