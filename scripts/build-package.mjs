#!/usr/bin/env node
/**
 * IC-05: compile engine/ into lib/ for publishing (ESM JS + .d.ts + source maps with inline
 * sources). Ambient declaration files (`virtual:` modules) are copied as they are. Inside the
 * repository everything resolves to engine/*.ts through the `state-surface-source` condition.
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = path.join(root, 'lib');
rmSync(lib, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.package.json'],
  { cwd: root, stdio: 'inherit' }
);

function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) {
      if (name !== '__fixtures__' && name !== '__snapshots__') walk(file, visit);
    } else visit(file);
  }
}
// tsc does not emit declaration inputs.
walk(path.join(root, 'engine'), file => {
  if (!file.endsWith('.d.ts')) return;
  const target = path.join(lib, path.relative(path.join(root, 'engine'), file));
  cpSync(file, target);
});

// Every export target exists.
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const missing = [];
const targets = value =>
  typeof value === 'string'
    ? [value]
    : Object.entries(value)
        .filter(([condition]) => condition !== 'state-surface-source')
        .flatMap(([, nested]) => targets(nested));
for (const [subpath, value] of Object.entries(pkg.exports))
  for (const target of targets(value)) {
    if (target.includes('*')) {
      const dir = path.join(root, path.dirname(target));
      if (!existsSync(dir)) missing.push(`${subpath}: ${target}`);
      continue;
    }
    if (!existsSync(path.join(root, target))) missing.push(`${subpath}: ${target}`);
  }
for (const [name, target] of Object.entries(pkg.bin ?? {})) {
  const file = path.join(root, target);
  if (!existsSync(file)) missing.push(`bin ${name}: ${target}`);
  else if (!readFileSync(file, 'utf8').startsWith('#!/usr/bin/env node'))
    missing.push(`bin ${name}: ${target} has no #!/usr/bin/env node line`);
  else chmodSync(file, 0o755);
}
if (missing.length) {
  console.error(`Missing package export targets:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log('lib/ built: ESM JS, declarations and source maps.');
