/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerTemplate, clearRegistry } from '../shared/templateRegistry.js';
import { createLithentBridge } from './lithentBridge.js';
import { h, mount } from 'lithent';
import type { TagFunction } from 'lithent';

const SimpleTemplate: TagFunction = mount((_renew, props: { title: string }) => {
  return (props: { title: string }) => h('div', { class: 'article' }, props.title);
});

describe('lithentBridge', () => {
  beforeEach(() => {
    clearRegistry();
    document.body.innerHTML = '';
  });

  describe('missing template fallback', () => {
    it('renders fallback div for unregistered template', () => {
      const el = document.createElement('h-state');
      document.body.appendChild(el);

      const bridge = createLithentBridge();
      bridge.renderTemplate('page:missing', {}, el);

      expect(el.innerHTML).toContain('Template "page:missing" not found');
      expect(el.querySelector('[data-error="template-fallback"]')).toBeTruthy();
    });

    it('does not crash the app when template is missing', () => {
      const el = document.createElement('h-state');
      document.body.appendChild(el);

      const bridge = createLithentBridge();

      // These should all run without throwing
      expect(() => bridge.renderTemplate('missing', {}, el)).not.toThrow();
      expect(() => bridge.hydrateTemplate('missing', {}, el)).not.toThrow();
      expect(() => bridge.updateTemplate('missing', {}, el)).not.toThrow();
      expect(() => bridge.unmountTemplate('missing', el)).not.toThrow();
    });

    it('calls onError callback when template is missing', () => {
      const onError = vi.fn();
      const el = document.createElement('h-state');
      document.body.appendChild(el);

      const bridge = createLithentBridge({ onError });
      bridge.renderTemplate('page:missing', {}, el);

      expect(onError).toHaveBeenCalledWith('page:missing', expect.any(Error));
    });

    it('uses fallback template when configured', () => {
      const FallbackTemplate: TagFunction = mount(() => {
        return () => h('div', { class: 'fallback' }, 'Fallback content');
      });

      registerTemplate('system:fallback', FallbackTemplate);

      const el = document.createElement('h-state');
      document.body.appendChild(el);

      const bridge = createLithentBridge({ fallbackTemplate: 'system:fallback' });
      bridge.renderTemplate('page:missing', {}, el);

      expect(el.innerHTML).toContain('Fallback content');
      expect(el.innerHTML).toContain('class="fallback"');
    });
  });

  describe('render and unmount', () => {
    it('renders registered template into element', () => {
      registerTemplate('page:article', SimpleTemplate);

      const el = document.createElement('h-state');
      document.body.appendChild(el);

      const bridge = createLithentBridge();
      bridge.renderTemplate('page:article', { title: 'Hello' }, el);

      expect(el.innerHTML).toContain('Hello');
      expect(el.innerHTML).toContain('class="article"');
    });

    it('unmounts cleans up without crashing', () => {
      registerTemplate('page:article', SimpleTemplate);

      const el = document.createElement('h-state');
      document.body.appendChild(el);

      const bridge = createLithentBridge();
      bridge.renderTemplate('page:article', { title: 'Test' }, el);

      expect(() => bridge.unmountTemplate('page:article', el)).not.toThrow();
    });
  });
});
