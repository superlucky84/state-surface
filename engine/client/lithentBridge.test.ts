/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLithentBridge } from './lithentBridge.js';
import { h, mount } from 'lithent';
import type { TagFunction } from 'lithent';

const SimpleTemplate = mount((_renew, _props: { title: string }) => {
  return (props: { title: string }) => h('div', { class: 'article' }, props.title);
}) as unknown as TagFunction;

const components = { 'components/Article.tsx#default': SimpleTemplate };

function anchor(componentId?: string) {
  const el = document.createElement('h-state');
  if (componentId) el.setAttribute('data-component', componentId);
  document.body.appendChild(el);
  return el;
}

describe('lithentBridge', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('missing component fallback', () => {
    it('renders fallback div when the slot names no registered component', () => {
      const el = anchor('components/Missing.tsx#default');

      const bridge = createLithentBridge({ components });
      bridge.renderTemplate('page:missing', {}, el);

      expect(el.innerHTML).toContain('Component for slot "page:missing" not found');
      expect(el.innerHTML).toContain('components/Missing.tsx#default');
      expect(el.querySelector('[data-error="template-fallback"]')).toBeTruthy();
    });

    it('does not crash the app when the component is missing', () => {
      const el = anchor();

      const bridge = createLithentBridge();

      expect(() => bridge.renderTemplate('missing', {}, el)).not.toThrow();
      expect(() => bridge.hydrateTemplate('missing', {}, el)).not.toThrow();
      expect(() => bridge.updateTemplate('missing', {}, el)).not.toThrow();
      expect(() => bridge.unmountTemplate('missing', el)).not.toThrow();
    });

    it('calls onError callback when the component is missing', () => {
      const onError = vi.fn();
      const el = anchor();

      const bridge = createLithentBridge({ onError });
      bridge.renderTemplate('page:missing', {}, el);

      expect(onError).toHaveBeenCalledWith('page:missing', expect.any(Error));
    });

    it('does not resolve inherited object keys as components', () => {
      const el = anchor('toString');
      createLithentBridge({ components }).renderTemplate('page:proto', {}, el);
      expect(el.querySelector('[data-error="template-fallback"]')).toBeTruthy();
    });
  });

  describe('render and unmount', () => {
    it('renders the component named by data-component', () => {
      const el = anchor('components/Article.tsx#default');

      const bridge = createLithentBridge({ components });
      bridge.renderTemplate('page:article', { title: 'Hello' }, el);

      expect(el.innerHTML).toContain('Hello');
      expect(el.innerHTML).toContain('class="article"');
    });

    it('lets two slots share one component with independent instances', async () => {
      const first = anchor('components/Article.tsx#default');
      const second = anchor('components/Article.tsx#default');

      const bridge = createLithentBridge({ components });
      bridge.renderTemplate('a:one', { title: 'One' }, first);
      bridge.renderTemplate('a:two', { title: 'Two' }, second);
      bridge.updateTemplate('a:two', { title: 'Updated' }, second);
      // Lithent applies component updates asynchronously.
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(first.textContent).toBe('One');
      expect(second.textContent).toBe('Updated');
    });

    it('unmounts cleans up without crashing', () => {
      const el = anchor('components/Article.tsx#default');

      const bridge = createLithentBridge({ components });
      bridge.renderTemplate('page:article', { title: 'Test' }, el);

      expect(() => bridge.unmountTemplate('page:article', el)).not.toThrow();
    });
  });
});
