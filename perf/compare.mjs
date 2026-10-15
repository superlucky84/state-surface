import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const [first, second] = process.argv.slice(2);
assert.ok(first && second, 'Usage: pnpm perf:compare first.json second.json');
const a = JSON.parse(await readFile(first, 'utf8'));
const b = JSON.parse(await readFile(second, 'utf8'));
assert.deepEqual(a.conditions, b.conditions, 'Measurement conditions must match');
assert.equal(a.browser, b.browser, 'Browser versions must match');
for (const page of a.pages) {
  const other = b.pages.find(p => p.path === page.path);
  assert.ok(other, `Missing ${page.path}`);
  console.log(page.path);
  for (const [key, value] of Object.entries(page.median)) {
    const next = other.median[key];
    console.log(
      `  ${key}: ${value} -> ${next} (${value === 0 || value === null || next === null ? 'n/a' : (((next - value) / value) * 100).toFixed(1) + '%'})`
    );
  }
}
