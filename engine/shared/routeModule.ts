import type { SurfaceContext } from '../server/core/context.js';

/** `export default async function Page(ctx)` in `routes/**\/*.tsx`. */
export type PageFunction = (ctx: SurfaceContext) => unknown | Promise<unknown>;

/** The params of one prerendered URL of a dynamic route: `{ lang: 'en', slug: 'intro' }`. */
export type StaticPath = Record<string, string>;

/** A page module: the default export plus optional named page options. */
export interface PageModule {
  default: PageFunction;
  /**
   * Build this page into static HTML (DC-24). Overrides `surface({ prerender })`; the HTML
   * is served through the middleware without rendering again (DC-32).
   */
  prerender?: boolean;
  /** Prerendered dynamic routes: the params to build. Requests for other params are 404. */
  getStaticPaths?: () => StaticPath[] | Promise<StaticPath[]>;
  /** Client plugins loaded only on this page (implemented with the client plugin API). */
  plugins?: readonly unknown[];
}
