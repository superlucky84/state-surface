import type { TagFunction } from 'lithent';

// ── Template Registry ──

const registry = new Map<string, TagFunction>();

export function registerTemplate(name: string, component: TagFunction) {
  registry.set(name, component);
}

export function getTemplate(name: string): TagFunction | undefined {
  return registry.get(name);
}

export function hasTemplate(name: string): boolean {
  return registry.has(name);
}

/**
 * Check that all required template names exist in the registry.
 * Returns the list of missing names (empty if all present).
 */
export function checkTemplates(names: string[]): string[] {
  return names.filter(name => !registry.has(name));
}

export function getAllTemplateNames(): string[] {
  return [...registry.keys()];
}

export function clearRegistry() {
  registry.clear();
}
