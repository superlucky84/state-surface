import type { PageModule, StaticPath } from '../../shared/routeModule.js';
import type { SlotMode } from '../../shared/surfaceTree.js';
import { TRANSITION_NAME, toDefinition, type TransitionDefinition } from '../transition.js';
import type { StandardSchema } from '../../shared/schema.js';
import type { PagePlugin } from '../ssrRenderer.js';
import { checkI18n, isLangPattern, type I18nConfig } from '../i18n.js';
import type { ImageConfig } from '../../shared/image.js';

/** Vite build manifest entries (keys are project-relative source paths). */
export type AssetManifest = Record<
  string,
  { file: string; css?: string[]; imports?: string[]; dynamicImports?: string[] }
>;
/**
 * Project-relative source paths (leading `/`) of the engine-managed head tags, resolved
 * through the asset manifest: global styles, the optional app entry (`client/entry.ts`)
 * and the engine chunks (loader entry, action runtime, Lithent bridge, morph, router).
 */
export interface DocumentConfig {
  styles?: string[];
  appEntry?: string;
  engine?: { loader: string; runtime: string; bridge: string; morph?: string; router?: string };
}

export type { StandardSchema };

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
  /** `surface({ prerender: true })`: pages prerender unless they export `prerender = false`. */
  prerender?: boolean;
  /** Language paths for `routes/[lang]/…` (DC-24 ⑤). */
  i18n?: I18nConfig;
  /** Public origin (`https://example.com`) for hreflang/canonical links of prerendered pages. */
  site?: string;
  /** `surface({ images })` (DC-26): widths, formats and remote patterns `/_surface/image` allows. */
  images?: Partial<ImageConfig>;
}

/** DC-24 ①: the page option wins over the build default. */
export function isPrerendered(route: ServerRoute, manifest: Pick<ServerManifest, 'prerender'>) {
  return route.module.prerender ?? manifest.prerender ?? false;
}

const paramNames = (pattern: string) =>
  pattern
    .split('/')
    .filter(segment => segment.startsWith(':'))
    .map(segment => segment.slice(1));

/** A `routes/[lang]/…` route with i18n configured: the build fills `lang` (DC-24 ⑤). */
const fillsLang = (route: ServerRoute, manifest: Pick<ServerManifest, 'i18n'>) =>
  !!manifest.i18n && isLangPattern(route.pattern);

/**
 * DC-24 ②⑤: the params a prerendered route is built for. On language routes, entries
 * without `lang` are built for every locale, and a route whose only param is `lang` needs
 * no `getStaticPaths()`.
 */
export async function staticParams(
  route: ServerRoute,
  manifest: Pick<ServerManifest, 'i18n'>
): Promise<StaticPath[]> {
  const names = paramNames(route.pattern);
  if (!names.length) return [{}];
  const lang = fillsLang(route, manifest);
  const list = route.module.getStaticPaths
    ? await route.module.getStaticPaths()
    : lang && names.length === 1
      ? [{}]
      : [];
  if (!Array.isArray(list))
    throw new Error('getStaticPaths() must return an array of params objects.');
  if (!lang) return list;
  return list.flatMap(params =>
    params && typeof params === 'object' && !Array.isArray(params) && !('lang' in params)
      ? manifest.i18n!.locales.map(locale => ({ ...params, lang: locale }))
      : [params]
  );
}

export function defineManifest(input: {
  routes: ServerManifest['routes'];
  /** Name (path under `transitions/`) → default export: a definition or a bare handler. */
  transitions: Record<string, unknown>;
  document?: DocumentConfig;
  assets?: AssetManifest;
  basePath?: string;
  buildId?: string;
  secret?: string;
  components?: Record<string, unknown>;
  prerender?: boolean;
  i18n?: I18nConfig;
  site?: string;
  images?: Partial<ImageConfig>;
}): ServerManifest {
  if (input.i18n) checkI18n(input.i18n);
  if (input.site !== undefined && !/^https?:\/\/[^/]+$/.test(input.site))
    throw new Error(`site must be an origin like "https://example.com" (got "${input.site}")`);
  const transitions: Record<string, TransitionDefinition> = Object.create(null);
  for (const [name, value] of Object.entries(input.transitions)) {
    if (!TRANSITION_NAME.test(name))
      throw new Error(`Transition name "${name}" must be kebab-case path segments`);
    transitions[name] = toDefinition(value, `transitions/${name}`);
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
    // DC-24 ②: a prerendered dynamic route lists its params.
    if (
      route.pattern.includes(':') &&
      isPrerendered(route, input) &&
      typeof route.module.getStaticPaths !== 'function' &&
      !(fillsLang(route, input) && paramNames(route.pattern).length === 1)
    )
      throw new Error(
        `Page ${route.page?.id ?? route.pattern} is prerendered and has dynamic params: ` +
          'export getStaticPaths() returning the params to build'
      );
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
