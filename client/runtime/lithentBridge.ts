import { h, render, mount, componentUpdate } from 'lithent';
import type { TagFunction, Props } from 'lithent';
import { hydration } from 'lithent/ssr';
import { getTemplate } from '../../shared/templateRegistry.js';
import type { StateSurfaceOptions } from './stateSurface.js';

type MountInfo = {
  cleanup: () => void;
  compKey: Props;
};

export type LithentBridgeOptions = {
  fallbackTemplate?: string;
  onError?: (name: string, error: unknown) => void;
};

/**
 * Create StateSurface callbacks wired to Lithent's render/hydration/update pipeline.
 *
 * The bridge wraps each template in a DataProxy component so external data
 * updates are forwarded through Lithent's VDOM diff.
 */
export function createLithentBridge(options?: LithentBridgeOptions): Pick<
  StateSurfaceOptions,
  'renderTemplate' | 'hydrateTemplate' | 'updateTemplate' | 'unmountTemplate'
> {
  const mounts = new Map<string, MountInfo>();
  const fallbackName = options?.fallbackTemplate;
  const onError = options?.onError;

  function resolveComponent(name: string): TagFunction | undefined {
    return getTemplate(name) ?? (fallbackName ? getTemplate(fallbackName) : undefined);
  }

  function renderFallback(el: HTMLElement, name: string, error?: unknown) {
    const msg = error ? `Render error in "${name}": ${error}` : `Template "${name}" not found`;
    el.innerHTML = `<div data-error="template-fallback">${escapeHtml(msg)}</div>`;
    onError?.(name, error ?? new Error(msg));
  }

  return {
    renderTemplate(name: string, data: any, el: HTMLElement) {
      const component = resolveComponent(name);
      if (!component) {
        renderFallback(el, name);
        return;
      }

      try {
        const proxyProps = { __data: data, __component: component };
        const wdom = h(DataProxy, proxyProps);
        const cleanup = render(wdom, el);
        mounts.set(name, { cleanup, compKey: proxyProps });
      } catch (err) {
        renderFallback(el, name, err);
      }
    },

    hydrateTemplate(name: string, data: any, el: HTMLElement): () => void {
      const component = resolveComponent(name);
      if (!component) {
        renderFallback(el, name);
        return () => {};
      }

      try {
        const proxyProps = { __data: data, __component: component };
        const wdom = h(DataProxy, proxyProps);
        const cleanup = hydration(wdom, el);
        mounts.set(name, { cleanup, compKey: proxyProps });
        return cleanup;
      } catch (err) {
        renderFallback(el, name, err);
        return () => {};
      }
    },

    updateTemplate(name: string, data: any, el: HTMLElement) {
      const info = mounts.get(name);
      if (!info) return;

      try {
        info.compKey.__data = data;
        componentUpdate(info.compKey)();
      } catch (err) {
        renderFallback(el, name, err);
        mounts.delete(name);
      }
    },

    unmountTemplate(name: string, _el: HTMLElement) {
      const info = mounts.get(name);
      if (!info) return;
      info.cleanup();
      mounts.delete(name);
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Internal wrapper component.
 * Delegates rendering to the actual template component while allowing
 * external data updates through prop mutation + componentUpdate.
 */
const DataProxy = mount<{ __data: any; __component: TagFunction }>((_renew, props) => {
  return (props: { __data: any; __component: TagFunction }) => {
    return h(props.__component, props.__data ?? {});
  };
});
