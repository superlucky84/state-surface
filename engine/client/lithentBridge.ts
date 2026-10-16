import { h, render, mount, componentUpdate } from 'lithent';
import type { TagFunction, Props } from 'lithent';
import { hydration } from 'lithent/ssr';

/**
 * Lithent glue, loaded as its own chunk only on pages that activate a client component.
 * Each instance is wrapped in a DataProxy so external props updates go through Lithent's
 * VDOM diff while local state survives.
 */
export interface Mount {
  update(data: unknown): void;
  cleanup(): void;
}

export interface MountOptions {
  /** Reuse the SSR DOM (hydration) instead of rendering into an empty host. */
  hydrate: boolean;
  /** Island children: static server HTML passed as the component's children (IC-03). */
  childrenHtml?: string;
}

export function mountComponent(
  component: TagFunction,
  data: unknown,
  el: HTMLElement,
  options: MountOptions
): Mount {
  const proxyProps: Props = {
    __data: data,
    __component: component,
    __children:
      options.childrenHtml === undefined
        ? []
        : [h('h-children', { style: 'display:contents', innerHTML: options.childrenHtml })],
  };
  const wdom = h(DataProxy as TagFunction, proxyProps);
  const cleanup = options.hydrate ? hydration(wdom, el) : render(wdom, el);
  return {
    update(next) {
      proxyProps.__data = next;
      componentUpdate(proxyProps)();
    },
    cleanup,
  };
}

const DataProxy = mount<{ __data: any; __component: TagFunction; __children: unknown[] }>(
  () => props => h(props.__component, props.__data ?? {}, ...(props.__children as never[]))
);
