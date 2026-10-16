import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeDocument } from './normalize.mjs';
import { startServer } from '../perf/server.mjs';

/**
 * Semantic SSR parity with the stage 1 demo snapshot (`conformance/stage1-demo.json`,
 * captured from the production build at c82b92c before the page/slot pipeline).
 *
 * Allowed differences (IMPLEMENT stage 2 Exit): doctype spelling, comment markers,
 * position of engine-managed tags (stylesheets, bootstrap JSON, entry script), the
 * entry asset hash and nonce, the `data-component` slot attribute, and `__BOOT__` as an
 * array of entries. Element structure, attributes, text and bootstrap JSON must match.
 */

const snapshot = JSON.parse(await readFile(new URL('./stage1-demo.json', import.meta.url), 'utf8'));
const server = await startServer(3301);
let pages = 0;
try {
  for (const [variant, cookie] of [
    ['pages', undefined],
    ['ko', 'lang=ko'],
  ]) {
    for (const [path, expected] of Object.entries(snapshot[variant])) {
      const response = await fetch(server.origin + path, {
        headers: cookie ? { cookie } : {},
      });
      assert.equal(response.status, expected.status, `${variant} ${path} status`);
      const html = await response.text();
      if (expected.status !== 200) continue;
      const actual = normalizeDocument(html);
      const baseline = normalizeDocument(expected.html);
      assert.deepEqual(actual.json, baseline.json, `${variant} ${path}: bootstrap JSON`);
      assert.deepEqual(actual.tree, baseline.tree, `${variant} ${path}: document tree`);
      assert.equal(actual.styles.length, baseline.styles.length, `${variant} ${path}: styles`);
      assert.equal(actual.entry, baseline.entry, `${variant} ${path}: entry script`);
      pages++;
    }
  }
  for (const [name, expected] of Object.entries(snapshot.transitions)) {
    const response = await fetch(`${server.origin}/transition/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: server.origin },
      body: JSON.stringify(expected.body),
    });
    assert.equal(response.status, expected.status, name);
    assert.deepEqual(
      (await response.text()).trim().split('\n').map(JSON.parse),
      expected.frames,
      name
    );
  }
  console.log(
    `Stage 1 parity: ${pages} SSR documents (en + ko) and ` +
      `${Object.keys(snapshot.transitions).length} transition streams match semantically`
  );
} finally {
  await server.stop();
}
