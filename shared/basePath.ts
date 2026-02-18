/**
 * shared/basePath.ts — single source of truth for basePath.
 *
 * setBasePath(path)  — call once at server startup (from process.env.BASE_PATH)
 *                      and once at client bootstrap (from __BASE_PATH__ script tag).
 * getBasePath()      — return the current basePath (empty string by default).
 * prefixPath(url)    — prepend basePath to a URL; no-op when basePath is empty.
 *
 * Zero-cost default: basePath='' means prefixPath(url) === url, so no existing
 * code is affected unless BASE_PATH is explicitly set.
 */

let _basePath = '';

/**
 * Normalize and store basePath.
 * - Empty string or '/' → resets to '' (no prefix).
 * - Leading slash ensured; trailing slash removed.
 * - e.g. 'state-surface' → '/state-surface'
 *        '/state-surface/' → '/state-surface'
 */
export function setBasePath(path: string): void {
  if (!path || path === '/') {
    _basePath = '';
    return;
  }
  const withLeading = path.startsWith('/') ? path : `/${path}`;
  _basePath = withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

export function getBasePath(): string {
  return _basePath;
}

/**
 * Prefix a URL with the current basePath.
 * - basePath='' → url unchanged (zero-cost default)
 * - url='/'     → `${basePath}/`
 * - url='/foo'  → `${basePath}/foo`
 */
export function prefixPath(url: string): string {
  if (!_basePath) return url;
  if (url === '/') return `${_basePath}/`;
  const normalUrl = url.startsWith('/') ? url : `/${url}`;
  return `${_basePath}${normalUrl}`;
}
