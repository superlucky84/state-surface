import type { AssetManifest } from './core/manifest.js';
import { prefixPath } from '../shared/basePath.js';

// Immutable application build configuration, initialized by the generated entry.
let assets: AssetManifest = {};
export function configureAssets(value: AssetManifest) {
  assets = value;
}
export function resolveAsset(source: string): string {
  const entry = assets[source.replace(/^\//, '')];
  return prefixPath(entry ? '/' + entry.file : source);
}
export function resolveAssetCss(source: string): string[] {
  const entry = assets[source.replace(/^\//, '')];
  if (entry?.css) return entry.css.map(file => prefixPath('/' + file));
  return [prefixPath(entry?.file?.endsWith('.css') ? '/' + entry.file : source)];
}

/**
 * A built chunk with its static import closure and CSS. Undefined in dev, where Vite
 * serves modules on demand and injects their CSS.
 */
export function resolveChunk(source: string): { files: string[]; css: string[] } | undefined {
  const key = source.replace(/^\//, '');
  if (!assets[key]) return undefined;
  const files: string[] = [];
  const css: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string) => {
    const entry = assets[name];
    if (!entry || seen.has(name)) return;
    seen.add(name);
    files.push(prefixPath('/' + entry.file));
    for (const file of entry.css ?? []) css.push(prefixPath('/' + file));
    for (const imported of entry.imports ?? []) visit(imported);
  };
  visit(key);
  return { files, css };
}
