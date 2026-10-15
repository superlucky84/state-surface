import type { TagFunction } from 'lithent';
import type { RouteModule } from '../../shared/routeModule.js';
import type { TransitionHandler, TransitionModule } from '../transition.js';
import type { TemplateModule } from '../../shared/templateRegistry.js';

export type AssetManifest = Record<string, { file: string; css?: string[] }>;
export interface ServerManifest {
  routes: Array<{ pattern: string; module: RouteModule }>;
  transitions: Record<string, TransitionHandler>;
  templates: Record<string, TagFunction>;
  assets?: AssetManifest;
  basePath?: string;
}
export function defineManifest(input: {
  routes: ServerManifest['routes'];
  transitions: TransitionModule[];
  templates: TemplateModule[];
  assets?: AssetManifest;
  basePath?: string;
}): ServerManifest {
  function unique<T extends { name: string }>(values: T[], select: (value: T) => unknown) {
    const result: Record<string, any> = Object.create(null);
    for (const value of values) {
      if (Object.hasOwn(result, value.name))
        throw new Error(`Duplicate registry name: ${value.name}`);
      result[value.name] = select(value);
    }
    return result;
  }
  const patterns = new Set<string>();
  for (const route of input.routes) {
    if (patterns.has(route.pattern)) throw new Error(`Duplicate route: ${route.pattern}`);
    if (typeof route.module?.layout !== 'function')
      throw new Error(`Route ${route.pattern} must export a layout`);
    patterns.add(route.pattern);
  }
  return {
    ...input,
    routes: [...input.routes].sort(
      (a, b) =>
        Number(a.pattern.includes(':')) - Number(b.pattern.includes(':')) ||
        a.pattern.localeCompare(b.pattern)
    ),
    transitions: unique(input.transitions, t => t.handler),
    templates: unique(input.templates, t => t.template),
  };
}
