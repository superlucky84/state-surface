#!/usr/bin/env node
/**
 * Build scaffold/ from project root files + create-state-surface/overrides.
 *
 * Copies user-facing directories (client/, shared/, routes/, layouts/) and
 * root files (server.ts, .prettierrc) into scaffold/, then overlays
 * template-specific overrides (tsconfig.json, vite.config.ts, etc.).
 *
 * client/styles.css is filtered to remove engine-only @source lines.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scaffold = resolve(root, 'scaffold');
const overrides = resolve(root, 'create-state-surface/overrides');

// Clean previous build
rmSync(scaffold, { recursive: true, force: true });
mkdirSync(scaffold, { recursive: true });

// 1. Copy directories
const SYNC_DIRS = ['client', 'shared', 'routes', 'layouts'];
for (const dir of SYNC_DIRS) {
  cpSync(resolve(root, dir), resolve(scaffold, dir), { recursive: true });
}

// 2. Copy root files
const SYNC_ROOT_FILES = ['server.ts', '.prettierrc'];
for (const f of SYNC_ROOT_FILES) {
  cpSync(resolve(root, f), resolve(scaffold, f));
}

// 3. Filter client/styles.css — remove engine-specific @source lines
const stylesPath = resolve(scaffold, 'client/styles.css');
const styles = readFileSync(stylesPath, 'utf8');
const filtered = styles
  .split('\n')
  .filter(line => !line.includes("'../engine/"))
  .join('\n');
writeFileSync(stylesPath, filtered);

// 4. Overlay template-specific overrides
cpSync(overrides, scaffold, { recursive: true });

console.log('scaffold/ built successfully.');
