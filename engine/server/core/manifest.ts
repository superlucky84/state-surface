import type { PageModule } from '../../shared/routeModule.js';
import type { TransitionHandler, TransitionModule } from '../transition.js';
import type { PagePlugin } from '../ssrRenderer.js';

/** Vite build manifest entries (keys are project-relative source paths). */
export type AssetManifest = Record<
  string,
  { file: string; css?: string[]; imports?: string[]; dynamicImports?: string[] }
>;
/**
 * Project-relative source paths (leading `/`) of the engine-managed head tags, resolved
 * through the asset manifest: global styles, the optional app entry (`client/entry.ts`)
 * and the engine chunks (loader entry, action runtime, Lithent bridge).
 */
export interface DocumentConfig {
  styles?: string[];
  appEntry?: string;
  engine?: { loader: string; runtime: string; bridge: string };
}
export interface ServerRoute {
  pattern: string;
  module: PageModule;
  /** Plugins declared by the page and the modules it imports (build analysis). */
  plugins?: PagePlugin[];
}
export interface ServerManifest {
  routes: ServerRoute[];
  transitions: Record<string, TransitionHandler>;
  document?: DocumentConfig;
  assets?: AssetManifest;
  basePath?: string;
}
export function defineManifest(input: {
  routes: ServerManifest['routes'];
  transitions: TransitionModule[];
  document?: DocumentConfig;
  assets?: AssetManifest;
  basePath?: string;
}): ServerManifest {
  const transitions: Record<string, TransitionHandler> = Object.create(null);
  for (const transition of input.transitions) {
    if (Object.hasOwn(transitions, transition.name))
      throw new Error(`Duplicate registry name: ${transition.name}`);
    transitions[transition.name] = transition.handler;
  }
  const patterns = new Set<string>();
  for (const route of input.routes) {
    if (patterns.has(route.pattern)) throw new Error(`Duplicate route: ${route.pattern}`);
    if (typeof route.module?.default !== 'function')
      throw new Error(`Page ${route.pattern} must default-export a page function`);
    patterns.add(route.pattern);
  }
  return {
    ...input,
    routes: [...input.routes].sort(
      (a, b) =>
        Number(a.pattern.includes(':')) - Number(b.pattern.includes(':')) ||
        a.pattern.localeCompare(b.pattern)
    ),
    transitions,
  };
}
