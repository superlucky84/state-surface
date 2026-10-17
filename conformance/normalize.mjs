import { Window } from 'happy-dom';

/**
 * Normalize an SSR document for semantic comparison: element tree with sorted attributes
 * and collapsed text, the bootstrap (base path, boot entries, rendered slot names), stylesheet
 * hrefs and entry count. Comments, script/link placement and the `data-component` slot
 * attribute are ignored.
 */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sortKeys(value[key])])
    );
  return value;
}

export function normalizeDocument(html) {
  const window = new Window();
  const document = window.document;
  document.write(html);
  const json = {};
  let entry = 0;
  for (const script of Array.from(document.querySelectorAll('script'))) {
    if (script.getAttribute('type') === 'application/json' && script.id)
      json[script.id] = JSON.parse(script.textContent);
    else if (script.getAttribute('type') === 'module') entry++;
    script.remove();
  }
  if (json.__BOOT__ && !Array.isArray(json.__BOOT__)) json.__BOOT__ = [json.__BOOT__];
  // Stage 3 per-page plugin list (the stage 1 runtime loaded every plugin globally).
  delete json.__PLUGINS__;
  // Stage 4: one __SURFACE__ bootstrap. Compare what both versions express: base path,
  // boot entries and the set of rendered slots. Server slot props are no longer sent (DC-09).
  const bootstrap = {};
  if (json.__SURFACE__) {
    const surface = json.__SURFACE__;
    bootstrap.basePath = surface.basePath;
    bootstrap.boot = surface.boot ?? [];
    bootstrap.slots = (surface.slots ?? [])
      .map(slot => slot.id)
      .filter(id => !id.includes('$'))
      .sort();
  } else if (json.__STATE__ || json.__BASE_PATH__ !== undefined) {
    bootstrap.basePath = json.__BASE_PATH__ ?? '';
    bootstrap.boot = json.__BOOT__ ?? [];
    bootstrap.slots = Object.keys(json.__STATE__ ?? {}).sort();
  }
  for (const link of Array.from(document.querySelectorAll('link[rel="modulepreload"]')))
    link.remove();
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(link => {
    link.remove();
    return link.getAttribute('href');
  });
  const tree = node => {
    if (node.nodeType === 3) {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      return text ? text : undefined;
    }
    if (node.nodeType !== 1) return undefined;
    const attributes = Array.from(node.attributes)
      .filter(attr => attr.name !== 'data-component')
      // Stage 6: head elements the engine owns carry `data-ss` (client router head merge).
      .filter(attr => attr.name !== 'data-ss')
      // Stage 4: the chat input id lets server HTML replacement restore focus (DESIGN 4.3).
      .filter(attr => !(attr.name === 'id' && attr.value === 'chat-message'))
      .map(attr => [attr.name, attr.value])
      .sort(([a], [b]) => a.localeCompare(b));
    const children = Array.from(node.childNodes)
      .map(tree)
      .filter(child => child !== undefined);
    return [node.tagName.toLowerCase(), attributes, children];
  };
  const result = {
    tree: tree(document.documentElement),
    json: sortKeys(bootstrap),
    styles: styles.sort(),
    entry,
  };
  window.close();
  return result;
}
