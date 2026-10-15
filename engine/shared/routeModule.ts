import type { SurfaceContext } from '../server/core/context.js';

export type BootConfig = {
  auto: boolean;
  params?: (ctx: SurfaceContext) => Record<string, unknown>;
};

export type RouteModule = {
  /** Surface function: returns full HTML document string with <h-state> anchors and stateScript embedded */
  layout: (stateScript: string, ctx: SurfaceContext) => string;

  /** Name of a registered transition (required if the route uses streaming actions) */
  transition?: string;

  /** Extract transition params from SurfaceContext (defaults to {}) */
  params?: (ctx: SurfaceContext) => Record<string, unknown>;

  /** SSR base state. If omitted, falls back to transition's first full frame */
  initial?: (ctx: SurfaceContext) => Record<string, any> | Promise<Record<string, any>>;

  /** Auto-run transition on the client after hydration */
  boot?: BootConfig;
};
