// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { h, mount } from 'lithent';
import type { TagFunction } from 'lithent';
import { renderToString } from 'lithent/ssr';
import { registerTemplate, clearRegistry } from '../shared/templateRegistry.js';
import { renderTemplateToString, createSSRRenderer } from './ssrRenderer.js';

const SimpleTemplate: TagFunction = mount((_renew, props: { title: string }) => {
  return (props: { title: string }) => h('div', { class: 'article' }, props.title);
});

describe('ssrRenderer', () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe('Lithent SSR attribute contract', () => {
    it('serializes JSON data attributes with escaped quotes', () => {
      const params = { mode: 'full' };
      const html = renderToString(h('button', { 'data-params': JSON.stringify(params) }));
      expect(html).toContain('data-params="{&quot;mode&quot;:&quot;full&quot;');
      const root = document.createElement('div');
      root.innerHTML = html;
      expect(JSON.parse(root.firstElementChild!.getAttribute('data-params')!)).toEqual(params);
    });

    it('keeps quote and markup payloads inside a single title attribute', () => {
      const title = 'a"b<c>d&e\' onmouseover="alert(1)"><script>alert(1)</script>';
      const html = renderToString(h('div', { title }));
      expect(html).toContain('&quot;');
      expect(html).toContain('&lt;');
      expect(html).toContain('&gt;');
      expect(html).toContain('&amp;');
      // Full parser round-trip runs in Chromium: happy-dom 20 retains &lt;/&gt;
      // in attribute values, unlike browser HTML parsers.
      expect(html).toBe(
        '<div title="a&quot;b&lt;c&gt;d&amp;e\' onmouseover=&quot;alert(1)&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"></div>'
      );
    });

    it('preserves boolean, style and trusted innerHTML behavior', () => {
      const html = renderToString(
        h('button', {
          disabled: true,
          hidden: false,
          style: { color: 'red', fontFamily: '"Fira Code", monospace' },
          innerHTML: '<strong>trusted</strong>',
        })
      );
      const root = document.createElement('div');
      root.innerHTML = html;
      const button = root.firstElementChild as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.hasAttribute('hidden')).toBe(false);
      expect(button.style.color).toBe('red');
      expect(button.style.fontFamily).toContain('Fira Code');
      expect(button.innerHTML).toBe('<strong>trusted</strong>');
    });
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

    it('can render from an injected registry resolver', () => {
      const renderer = createSSRRenderer({
        getTemplate(name) {
          if (name === 'custom:slot') return SimpleTemplate;
          return undefined;
        },
      });

      const html = renderer('custom:slot', { title: 'Injected' });
      expect(html).toContain('Injected');
    });
  });
});
