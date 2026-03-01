import fs from 'node:fs';
import path from 'node:path';
import { prefixPath } from '../shared/basePath.js';

type Manifest = Record<string, { file: string; css?: string[] }>;

let manifest: Manifest | null = null;

export function loadManifest(rootDir: string): void {
  const manifestPath = path.join(rootDir, 'dist/client/.vite/manifest.json');
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  }
}

/**
 * Resolve a source path to its production asset path.
 * In dev mode (no manifest), returns the source path as-is.
 * In production, looks up the hashed filename from the Vite manifest.
 */
export function resolveAsset(srcPath: string): string {
  if (!manifest) return prefixPath(srcPath);

  // Manifest keys are relative to project root (no leading slash)
  const key = srcPath.replace(/^\//, '');
  const entry = manifest[key];
  if (entry) return prefixPath('/' + entry.file);

  return prefixPath(srcPath);
}

/**
 * Get CSS files associated with a JS entry from the manifest.
 */
export function resolveAssetCss(srcPath: string): string[] {
  if (!manifest) return [prefixPath(srcPath)];

  const key = srcPath.replace(/^\//, '');
  const entry = manifest[key];
  if (entry?.css) return entry.css.map(f => prefixPath('/' + f));
  if (entry?.file?.endsWith('.css')) return [prefixPath('/' + entry.file)];

  return [prefixPath(srcPath)];
}
