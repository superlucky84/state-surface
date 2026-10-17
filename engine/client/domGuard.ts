import { unsafeAttribute } from '../shared/capability.js';

/**
 * Browser half of the strict/rich capability (DESIGN 8.1). The server sanitizes SSR and
 * `html` ops, but a client component renders frame props in the browser: Lithent writes
 * `href="javascript:…"`, upper-case `ONCLICK` strings, `srcdoc` and `innerHTML` straight
 * into the DOM. The guard removes the attributes the server would drop, right after each
 * bridge render or update and, for the component's own local updates, from a
 * MutationObserver. Its microtask runs before any later task, so queued navigations
 * (`<iframe src="javascript:…">`), `onerror`/`ontoggle` handlers and clicks see the clean
 * DOM (checked in Chromium).
 */
export interface DomGuard {
  /** Clean what changed since the last check (synchronously, after a bridge update). */
  flush(): void;
  dispose(): void;
}

export function guardDom(root: Element): DomGuard {
  cleanTree(root);
  const observer = new MutationObserver(clean);
  observer.observe(root, { subtree: true, childList: true, attributes: true });
  function clean(records: MutationRecord[]) {
    for (const record of records) {
      if (record.type === 'attributes') cleanElement(record.target as Element);
      else
        for (const node of record.addedNodes) if (node.nodeType === 1) cleanTree(node as Element);
    }
  }
  return {
    flush: () => clean(observer.takeRecords()),
    dispose: () => observer.disconnect(),
  };
}

function cleanTree(root: Element) {
  cleanElement(root);
  for (const element of root.querySelectorAll('*')) cleanElement(element);
}

function cleanElement(element: Element) {
  if (!element.attributes.length) return;
  const animated = element.getAttribute('attributeName') ?? undefined;
  for (const { name, value } of Array.from(element.attributes))
    if (unsafeAttribute(element.localName, name, value, animated)) element.removeAttribute(name);
}
