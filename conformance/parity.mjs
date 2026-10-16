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
 * entry asset hash and nonce, the `data-component` slot attribute, `__BOOT__` as an array of
 * entries, (stage 3) modulepreload links and the per-page `__PLUGINS__` list, and (stage 4) the
 * single `__SURFACE__` bootstrap without server slot props plus transition streams projected
 * to per-slot ops. Element structure, attributes, text, base path, boot entries and rendered
 * slots must match; each transition must touch the same slots frame by frame.
 */

/** Stage 1 state frame → [kind, slots]; stage 4 patch → [kind, slots] (UI resets ignored). */
const stage1Shape = frame =>
  frame.type !== 'state'
    ? [frame.type, []]
    : [
        frame.full === false ? 'partial' : 'full',
        [
          ...new Set([...(frame.changed ?? Object.keys(frame.states)), ...(frame.removed ?? [])]),
        ].sort(),
      ];
const stage4Shape = frame =>
  frame.type !== 'patch'
    ? [frame.type, []]
    : [
        frame.reset ? 'full' : 'partial',
        [
          ...new Set(frame.ops.filter(op => !('ui' in op && op.ui === null)).map(op => op.slot)),
        ].sort(),
      ];
const pageOf = { 'switch-lang': 'index', search: 'examples/search', 'guide-load': 'guide/[slug]' };

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
      assert.equal(actual.json.basePath, baseline.json.basePath, `${variant} ${path}: base path`);
      assert.deepEqual(actual.json.boot, baseline.json.boot, `${variant} ${path}: boot`);
      // Stage 1 listed slots that had state; stage 4 lists every rendered slot (empty ones too).
      for (const slot of baseline.json.slots ?? [])
        assert.ok(actual.json.slots?.includes(slot), `${variant} ${path}: slot ${slot}`);
      assert.deepEqual(actual.tree, baseline.tree, `${variant} ${path}: document tree`);
      assert.equal(actual.styles.length, baseline.styles.length, `${variant} ${path}: styles`);
      assert.equal(actual.entry, baseline.entry, `${variant} ${path}: entry script`);
      pages++;
    }
  }
  const home = await (await fetch(server.origin + '/')).text();
  const buildId = JSON.parse(home.match(/id="__SURFACE__"[^>]*>(.*?)<\/script>/)[1]).buildId;
  for (const [name, expected] of Object.entries(snapshot.transitions)) {
    const response = await fetch(`${server.origin}/transition/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: server.origin,
        'x-surface-build': buildId,
        'x-surface-page': pageOf[name],
      },
      body: JSON.stringify(expected.body),
    });
    assert.equal(response.status, expected.status, name);
    assert.deepEqual(
      (await response.text()).trim().split('\n').map(JSON.parse).map(stage4Shape),
      expected.frames.map(stage1Shape),
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
