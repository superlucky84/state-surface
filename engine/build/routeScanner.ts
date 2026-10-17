import path from 'node:path';
import { listFiles } from './fsUtils.js';
import { SurfaceBuildError, atDefaultExport } from './diagnostics.js';

export type ScannedRoute = {
  urlPattern: string;
  filePath: string;
};

/**
 * Convert a page file path (relative to routes/) to a URL pattern.
 *
 * Examples:
 *   index.tsx                → /
 *   search.tsx               → /search
 *   article/[id].tsx         → /article/:id
 *   admin/index.tsx          → /admin
 *   admin/users/[userId].tsx → /admin/users/:userId
 */
export function fileToUrlPattern(relativePath: string): string {
  const segments = relativePath
    .replace(/\\/g, '/')
    .replace(/\.tsx$/, '')
    .split('/')
    .map(seg => {
      if (seg === 'index') return '';
      const paramMatch = seg.match(/^\[(.+)\]$/);
      return paramMatch ? ':' + paramMatch[1] : seg;
    })
    .filter(seg => seg.length > 0);
  return '/' + segments.join('/');
}

/**
 * A page is any `routes/**\/*.tsx` file that is not inside, and is not itself, a
 * `_`-prefixed file or folder. Helper components live next to pages in `_components/`.
 */
export function isPageFile(relativePath: string): boolean {
  if (!relativePath.endsWith('.tsx') || relativePath.endsWith('.d.tsx')) return false;
  if (/\.(test|spec)\.tsx$/.test(relativePath)) return false;
  return !relativePath.split(/[/\\]/).some(seg => seg.startsWith('_') || seg.startsWith('.'));
}

function sortRoutes(routes: ScannedRoute[]): ScannedRoute[] {
  return routes.sort((a, b) => {
    const aDynamic = a.urlPattern.includes(':');
    const bDynamic = b.urlPattern.includes(':');
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1;
    return a.urlPattern.localeCompare(b.urlPattern);
  });
}

/**
 * Scan routes/ for page modules. Two files resolving to the same URL are a build error.
 */
export async function scanRoutes(routesDir: string): Promise<ScannedRoute[]> {
  const routes: ScannedRoute[] = [];
  const owners = new Map<string, string>();
  for (const file of (await listFiles(routesDir)).sort()) {
    const relativePath = path.relative(routesDir, file);
    if (!isPageFile(relativePath)) continue;
    const urlPattern = fileToUrlPattern(relativePath);
    const previous = owners.get(urlPattern);
    if (previous)
      throw new SurfaceBuildError(
        `Pages ${previous} and ${path.relative(path.dirname(routesDir), file)} both map to ` +
          `"${urlPattern}".`,
        {
          ...(await atDefaultExport(file)),
          hint: 'Keep one of them; helpers next to pages go in _-prefixed files or folders.',
        }
      );
    owners.set(urlPattern, path.relative(path.dirname(routesDir), file));
    routes.push({ urlPattern, filePath: file });
  }
  return sortRoutes(routes);
}
