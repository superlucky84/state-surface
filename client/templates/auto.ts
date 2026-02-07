import { registerTemplate } from '../../shared/templateRegistry.js';
import type { TemplateModule } from '../../shared/templateRegistry.js';

export function registerTemplates() {
  const entries = Object.entries(import.meta.glob('/routes/**/templates/**/*.tsx', { eager: true }));
  for (const [, mod] of entries) {
    const template = extractTemplate(mod);
    registerTemplate(template.name, template.template);
  }
}

function extractTemplate(mod: any): TemplateModule {
  const candidate = mod?.default ?? mod?.template;
  if (candidate?.name && candidate?.template) return candidate as TemplateModule;
  if (mod?.name && mod?.template) return { name: mod.name, template: mod.template };
  throw new Error('Template module must export { name, template } as default or named export');
}

registerTemplates();
