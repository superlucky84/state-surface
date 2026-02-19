import { describe, it, expect, beforeEach } from 'vitest';
import { h, mount } from 'lithent';
import type { TagFunction } from 'lithent';
import { registerTemplate, clearRegistry } from '../shared/templateRegistry.js';
import { renderTemplateToString, createSSRRenderer } from './ssrRenderer.js';

const SimpleTemplate: TagFunction = mount((_renew, props: { title: string }) => {
  return (props: { title: string }) => h('div', { class: 'article' }, props.title);
});

describe('ssrRenderer', () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe('renderTemplateToString', () => {
    it('renders registered template to HTML', () => {
      registerTemplate('page:article', SimpleTemplate);

      const html = renderTemplateToString('page:article', { title: 'Hello SSR' });
      expect(html).toContain('Hello SSR');
      expect(html).toContain('class="article"');
    });

    it('returns undefined for unregistered template', () => {
      expect(renderTemplateToString('page:missing', {})).toBeUndefined();
    });
  });

  describe('createSSRRenderer', () => {
    it('returns HTML for registered template', () => {
      registerTemplate('page:article', SimpleTemplate);
      const renderer = createSSRRenderer();

      const html = renderer('page:article', { title: 'Test' });
      expect(html).toContain('Test');
    });

    it('returns fallback comment for missing template', () => {
      const renderer = createSSRRenderer();

      const html = renderer('page:unknown', {});
      expect(html).toContain('<!-- template "page:unknown" not found -->');
    });

    it('uses same registry as client-side registration', () => {
      // Register via shared registry (same as client would)
      registerTemplate('shared:widget', SimpleTemplate);

      // SSR renderer finds it
      const html = renderTemplateToString('shared:widget', { title: 'Shared' });
      expect(html).toContain('Shared');
    });
  });
});
