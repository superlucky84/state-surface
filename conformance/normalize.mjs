import { Window } from 'happy-dom';

/**
 * Normalize an SSR document for semantic comparison: element tree with sorted attributes
 * and collapsed text, bootstrap JSON by script id, stylesheet hrefs and entry count.
 * Comments, script/link placement and the `data-component` slot attribute are ignored.
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
      .map(attr => [attr.name, attr.value])
      .sort(([a], [b]) => a.localeCompare(b));
    const children = Array.from(node.childNodes)
      .map(tree)
      .filter(child => child !== undefined);
    return [node.tagName.toLowerCase(), attributes, children];
  };
  const result = {
    tree: tree(document.documentElement),
    json: sortKeys(json),
    styles: styles.sort(),
    entry,
  };
  window.close();
  return result;
}
