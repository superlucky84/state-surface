import { h, render } from 'lithent';
import type { TagFunction } from 'lithent';
import { hydration } from 'lithent/ssr';
import type { ComponentRegistry } from './lithentBridge.js';

/**
 * Activate direct directive islands (`<h-island>`). Until the activation scheduler exists,
 * every island starts at load: SSR islands hydrate, `client:only` islands replace their
 * fallback. Children arrive as a static server-rendered fragment (IC-03): from the
 * `<template data-surface-children>` transport, otherwise from the island's own
 * `<h-children>` wrapper.
 */
export function hydrateIslands(
  components: ComponentRegistry,
  onError: (id: string, error: unknown) => void = () => {},
  root: ParentNode = document
): Array<() => void> {
  const cleanups: Array<() => void> = [];
  for (const host of Array.from(root.querySelectorAll<HTMLElement>('h-island[data-island]'))) {
    const id = host.getAttribute('data-component') ?? '';
    try {
      const component = Object.hasOwn(components, id) ? components[id] : undefined;
      if (!component) throw new Error(`Island component "${id}" not found`);
      const props = JSON.parse(host.getAttribute('data-props') ?? '{}');
      const template = Array.from(host.children).find(
        child => child.tagName === 'TEMPLATE' && child.hasAttribute('data-surface-children')
      ) as HTMLTemplateElement | undefined;
      let html: string | undefined;
      if (template) {
        html = template.innerHTML;
        template.remove();
      } else {
        html = Array.from(host.querySelectorAll('h-children')).find(
          wrapper => wrapper.closest('h-island') === host
        )?.innerHTML;
      }
      const children =
        html === undefined ? [] : [h('h-children', { style: 'display:contents', innerHTML: html })];
      const wdom = h(component as TagFunction, props, ...children);
      if (host.hasAttribute('data-only')) {
        host.innerHTML = '';
        cleanups.push(render(wdom, host));
      } else cleanups.push(hydration(wdom, host));
    } catch (error) {
      onError(id, error);
    }
  }
  return cleanups;
}
