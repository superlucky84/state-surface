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
