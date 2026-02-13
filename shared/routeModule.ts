import type { Request } from 'express';

export type BootConfig = {
  auto: boolean;
  params?: (req: Request) => Record<string, unknown>;
};

export type RouteModule = {
  /** Surface function: returns full HTML document string with <h-state> anchors and stateScript embedded */
  layout: (stateScript: string) => string;

  /** Name of a registered transition (required if the route uses streaming actions) */
  transition?: string;

  /** Extract transition params from Express request (defaults to {}) */
  params?: (req: Request) => Record<string, unknown>;

  /** SSR base state. If omitted, falls back to transition's first full frame */
  initial?: (req: Request) => Record<string, any> | Promise<Record<string, any>>;

  /** Auto-run transition on the client after hydration */
  boot?: BootConfig;
};
