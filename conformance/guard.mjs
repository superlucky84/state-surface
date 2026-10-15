import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const bundle = await readFile('dist/conformance/core.mjs', 'utf8');
assert.doesNotMatch(
  bundle,
  /(?:from\s*["'](?:node:|express)|import\s*\(\s*["'](?:node:|express)|\bprocess\.env|\breaddir\b|readFileSync)/,
  'Core bundle must be runtime portable'
);
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) await scan(path);
    else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
      const source = await readFile(path, 'utf8');
      assert.doesNotMatch(
        source,
        /(?:from\s*["'](?:node:|express)|import\s*\(\s*["'](?:node:|express)|\bprocess\.env|\breaddir\b|readFileSync)/,
        path
      );
    }
  }
}
await scan('engine/server');
console.log(
  `Portable core guard passed (${Buffer.byteLength(bundle)} byte bundle; no Node/Express/env/runtime scans)`
);
