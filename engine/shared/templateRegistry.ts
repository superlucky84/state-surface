import type { TagFunction } from 'lithent';

// ── Template Modules ──

export type TemplateModule = {
  name: string;
  template: TagFunction;
};

export function defineTemplate(name: string, template: TagFunction): TemplateModule {
  return { name, template };
}

// ── Template Registry ──

export type TemplateRegistry = {
  registerTemplate: (name: string, component: TagFunction) => void;
  getTemplate: (name: string) => TagFunction | undefined;
  hasTemplate: (name: string) => boolean;
  checkTemplates: (names: string[]) => string[];
  getAllTemplateNames: () => string[];
  clearRegistry: () => void;
};

export function createTemplateRegistry(): TemplateRegistry {
  const registry = new Map<string, TagFunction>();

  return {
    registerTemplate(name: string, component: TagFunction) {
      registry.set(name, component);
    },
    getTemplate(name: string) {
      return registry.get(name);
    },
    hasTemplate(name: string) {
      return registry.has(name);
    },
    checkTemplates(names: string[]) {
      return names.filter(name => !registry.has(name));
    },
    getAllTemplateNames() {
      return [...registry.keys()];
    },
    clearRegistry() {
      registry.clear();
    },
  };
}

const defaultRegistry = createTemplateRegistry();

export function registerTemplate(name: string, component: TagFunction) {
  defaultRegistry.registerTemplate(name, component);
}

export function getTemplate(name: string): TagFunction | undefined {
  return defaultRegistry.getTemplate(name);
}

export function hasTemplate(name: string): boolean {
  return defaultRegistry.hasTemplate(name);
}

/**
 * Check that all required template names exist in the registry.
 * Returns the list of missing names (empty if all present).
 */
export function checkTemplates(names: string[]): string[] {
  return defaultRegistry.checkTemplates(names);
}

export function getAllTemplateNames(): string[] {
  return defaultRegistry.getAllTemplateNames();
}

export function clearRegistry() {
  defaultRegistry.clearRegistry();
}
