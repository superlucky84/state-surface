import type { PageModule } from '../../shared/routeModule.js';
import type { SlotMode } from '../../shared/surfaceTree.js';
import type { TransitionDefinition, TransitionModule } from '../transition.js';
import type { PagePlugin } from '../ssrRenderer.js';

/** Vite build manifest entries (keys are project-relative source paths). */
export type AssetManifest = Record<
  string,
  { file: string; css?: string[]; imports?: string[]; dynamicImports?: string[] }
>;
/**
 * Project-relative source paths (leading `/`) of the engine-managed head tags, resolved
 * through the asset manifest: global styles, the optional app entry (`client/entry.ts`)
 * and the engine chunks (loader entry, action runtime, Lithent bridge, morph).
 */
export interface DocumentConfig {
  styles?: string[];
  appEntry?: string;
  engine?: { loader: string; runtime: string; bridge: string; morph?: string };
}

/** Standard Schema v1 (https://standardschema.dev), the part the engine calls. */
export interface StandardSchema {
  readonly '~standard': {
    readonly version: 1;
    readonly validate: (
      value: unknown
    ) =>
      | { value: unknown; issues?: undefined }
      | { issues: ReadonlyArray<{ message: string }> }
      | Promise<
          { value: unknown; issues?: undefined } | { issues: ReadonlyArray<{ message: string }> }
        >;
  };
}

/** One Slot of a page, from build analysis (DESIGN 6.2 page manifest). */
export interface PageSlotDefinition {
  mode: SlotMode;
  componentId: string;
  /** Server slots: the component rendered for `html` ops (resolved from `components`). */
  component?: unknown;
  swap?: 'replace' | 'morph';
  capability?: 'strict' | 'rich' | 'unsafe';
  sandbox?: 'iframe';
  viewTransition?: true;
  defer?: true;
  cache?: string;
  external?: true;
  schema?: StandardSchema;
}

/** Page manifest: slot definitions the server needs to project transitions for this page. */
export interface PageDefinition {
  /** Route file path without extension (`guide/[slug]`), sent as `X-Surface-Page`. */
  id: string;
  slots: Record<string, PageSlotDefinition>;
}

export interface ServerRoute {
  pattern: string;
  module: PageModule;
  /** Plugins declared by the page and the modules it imports (build analysis). */
  plugins?: PagePlugin[];
  page?: PageDefinition;
}
export interface ServerManifest {
  routes: ServerRoute[];
  transitions: Record<string, TransitionDefinition>;
  document?: DocumentConfig;
  assets?: AssetManifest;
  basePath?: string;
  /** Deployment identity checked with `X-Surface-Build` (409 on mismatch, default `dev`). */
  buildId?: string;
  /** Build-generated root secret (base64url), used when `SURFACE_SECRET` is not set. */
  secret?: string;
  /** componentId → server component for server slots and deferred responses. */
  components?: Record<string, unknown>;
}
export function defineManifest(input: {
  routes: ServerManifest['routes'];
  transitions: TransitionModule[];
  document?: DocumentConfig;
  assets?: AssetManifest;
  basePath?: string;
  buildId?: string;
  secret?: string;
  components?: Record<string, unknown>;
}): ServerManifest {
  const transitions: Record<string, TransitionDefinition> = Object.create(null);
  for (const transition of input.transitions) {
    if (Object.hasOwn(transitions, transition.name))
      throw new Error(`Duplicate registry name: ${transition.name}`);
    transitions[transition.name] = transition.definition;
  }
  const components: Record<string, unknown> = Object.create(null);
  Object.assign(components, input.components ?? {});
  const patterns = new Set<string>();
  const pages = new Set<string>();
  for (const route of input.routes) {
    if (patterns.has(route.pattern)) throw new Error(`Duplicate route: ${route.pattern}`);
    if (typeof route.module?.default !== 'function')
      throw new Error(`Page ${route.pattern} must default-export a page function`);
    patterns.add(route.pattern);
    if (!route.page) continue;
    if (pages.has(route.page.id)) throw new Error(`Duplicate page id: ${route.page.id}`);
    pages.add(route.page.id);
    for (const [name, slot] of Object.entries(route.page.slots))
      if (slot.mode === 'server' && slot.component === undefined) {
        if (!Object.hasOwn(components, slot.componentId))
          throw new Error(`Server slot "${name}" of ${route.page.id} has no component`);
        slot.component = components[slot.componentId];
      } else if (slot.mode === 'server' && !Object.hasOwn(components, slot.componentId))
        components[slot.componentId] = slot.component;
  }
  return {
    ...input,
    buildId: input.buildId ?? 'dev',
    components,
    routes: [...input.routes].sort(
      (a, b) =>
        Number(a.pattern.includes(':')) - Number(b.pattern.includes(':')) ||
        a.pattern.localeCompare(b.pattern)
    ),
    transitions,
  };
}
