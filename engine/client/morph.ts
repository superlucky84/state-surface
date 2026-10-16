/// <reference path="./idiomorph.d.ts" />
import { Idiomorph } from 'idiomorph';
import type { IslandMeta } from '../shared/protocol.js';
import type { ComponentHost } from './componentHost.js';

/**
 * `swap="morph"` (DC-03, IC-06), its own chunk loaded only on pages with a morph slot.
 * idiomorph 0.7.4 patches the existing DOM so nodes, focus, the focused input's value and
 * media state survive.
 * Island roots are boundaries: an island whose component and props are unchanged keeps its
 * DOM and instance (renamed to the new id), as does one whose resetKey values are unchanged
 * (it receives the new props); otherwise the old instance is disposed first and the new
 * HTML is activated from `islands` like a replace.
 */
export function morphSlot(
  el: HTMLElement,
  html: string,
  islands: readonly IslandMeta[],
  host: ComponentHost
) {
  const metas = new Map(islands.map(island => [island.id, island]));
  Idiomorph.morph(el, html, {
    morphStyle: 'innerHTML',
    // The focused control keeps what the user is typing; other values follow the server.
    ignoreActiveValue: true,
    callbacks: {
      beforeNodeMorphed(oldNode, newNode) {
        if (!(oldNode instanceof Element) || oldNode.tagName !== 'H-ISLAND') return true;
        const oldId = oldNode.getAttribute('data-island');
        const newId = newNode instanceof Element ? newNode.getAttribute('data-island') : null;
        const next = newId ? metas.get(newId) : undefined;
        if (oldId && next && host.keepIsland(oldId, next)) return false;
        if (oldId) host.dispose(oldId);
        return true;
      },
      beforeNodeRemoved(node) {
        host.disposeWithin(node);
        return true;
      },
    },
  });
}
