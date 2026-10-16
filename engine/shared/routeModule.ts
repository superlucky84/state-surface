import type { SurfaceContext } from '../server/core/context.js';

/** `export default async function Page(ctx)` in `routes/**\/*.tsx`. */
export type PageFunction = (ctx: SurfaceContext) => unknown | Promise<unknown>;

export interface StaticPath {
  params: Record<string, string>;
}

/** A page module: the default export plus optional named page options. */
export interface PageModule {
  default: PageFunction;
  /** Build-time HTML output (implemented with prerendering). */
  prerender?: boolean;
  getStaticPaths?: () => StaticPath[] | Promise<StaticPath[]>;
  /** Client plugins loaded only on this page (implemented with the client plugin API). */
  plugins?: readonly unknown[];
}
