import { h } from 'lithent';
import { renderToString } from 'lithent/ssr';
import type { TagFunction } from 'lithent';
import { getTemplate, hasTemplate } from '../shared/templateRegistry.js';

type SSRRendererOptions = {
  getTemplate?: (name: string) => TagFunction | undefined;
};

/**
 * Render a registered template to HTML string for SSR.
 * Uses the same shared registry as the client.
 *
 * Returns undefined if the template is not registered.
 */
export function renderTemplateToString(
  name: string,
  data: any,
  getTemplateFromRegistry: (name: string) => TagFunction | undefined = getTemplate
): string | undefined {
  const component = getTemplateFromRegistry(name);
  if (!component) return undefined;

  const wdom = h(component, data ?? {});
  return renderToString(wdom);
}

/**
 * Create a renderTemplate callback for fillHState.
 * Falls back to an error comment when template is missing or rendering fails.
 */
export function createSSRRenderer(
  options: SSRRendererOptions = {}
): (name: string, data: any) => string {
  const getTemplateFromRegistry = options.getTemplate ?? getTemplate;
  return (name: string, data: any): string => {
    try {
      const html = renderTemplateToString(name, data, getTemplateFromRegistry);
      if (html !== undefined) return html;
      return `<!-- template "${name}" not found -->`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `<!-- render error in "${name}": ${msg} -->`;
    }
  };
}

export { hasTemplate };
