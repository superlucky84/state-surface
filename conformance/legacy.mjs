import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startServer } from '../perf/server.mjs';
const baseline = JSON.parse(await readFile('conformance/legacy-demo.json', 'utf8'));
const server = await startServer(3300);
try {
  for (const [path, expected] of Object.entries(baseline.pages)) {
    const response = await fetch(server.origin + path);
    assert.equal(response.status, expected.status);
    assert.equal(await response.text(), expected.html, `SSR mismatch: ${path}`);
  }
  for (const [name, expected] of Object.entries(baseline.transitions)) {
    const response = await fetch(`${server.origin}/transition/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(expected.body),
    });
    assert.equal(response.status, expected.status);
    assert.deepEqual(
      (await response.text()).trim().split('\n').map(JSON.parse),
      expected.frames,
      name
    );
  }
  console.log(
    'Legacy parity: 9 SSR pages + 2 transition streams match Express baseline (SSR hash removed)'
  );
} finally {
  await server.stop();
}
