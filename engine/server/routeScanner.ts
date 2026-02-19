import path from 'node:path';
import { listFiles, isModuleFile, hasSegment } from './fsUtils.js';

export type ScannedRoute = {
  urlPattern: string;
  filePath: string;
};

/**
 * Convert a relative file path (from routes/) to an Express URL pattern.
 *
 * Examples:
 *   index.ts           → /
 *   search.ts          → /search
 *   article/[id].ts    → /article/:id
 *   admin/index.ts     → /admin
 *   admin/users/[userId].ts → /admin/users/:userId
 */
export function fileToUrlPattern(relativePath: string): string {
  const withoutExt = relativePath.replace(/\.ts$/, '');
  const segments = withoutExt.split('/');

  const urlSegments = segments
    .map(seg => {
      if (seg === 'index') return '';
      const paramMatch = seg.match(/^\[(.+)\]$/);
      if (paramMatch) return ':' + paramMatch[1];
      return seg;
    })
    .filter(seg => seg.length > 0);

  return '/' + urlSegments.join('/');
}

/**
 * Check if a file is a route module (not a template, transition, or shared asset).
 */
function isRouteFile(file: string): boolean {
  if (!isModuleFile(file)) return false;
  // Only .ts files (not .tsx — those are templates)
  if (!file.endsWith('.ts')) return false;
  // Skip files inside templates/ or transitions/ directories
  if (hasSegment(file, 'templates')) return false;
  if (hasSegment(file, 'transitions')) return false;
  // Skip _shared/ directory
  if (hasSegment(file, '_shared')) return false;
  return true;
}

/**
 * Sort routes so static segments come before dynamic ones.
 * This ensures Express matches /search before /article/:id.
 */
function sortRoutes(routes: ScannedRoute[]): ScannedRoute[] {
  return routes.sort((a, b) => {
    const aDynamic = a.urlPattern.includes(':');
    const bDynamic = b.urlPattern.includes(':');
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1;
    return a.urlPattern.localeCompare(b.urlPattern);
  });
}

/**
 * Scan the routes/ directory and discover route modules.
 * Returns sorted list of { urlPattern, filePath } entries.
 */
export async function scanRoutes(routesDir: string): Promise<ScannedRoute[]> {
  const files = await listFiles(routesDir);
  const routes: ScannedRoute[] = [];

  for (const file of files) {
    if (!isRouteFile(file)) continue;

    const relativePath = path.relative(routesDir, file);
    const urlPattern = fileToUrlPattern(relativePath);
    routes.push({ urlPattern, filePath: file });
  }

  return sortRoutes(routes);
}
