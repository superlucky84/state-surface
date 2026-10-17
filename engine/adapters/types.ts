export interface Adapter {
  name: 'node' | 'express' | 'bun' | 'deno' | 'cloudflare';
  serverEntry: string;
  supports: { fs: boolean; imageTransform: boolean; longStream: boolean };
  readStatic(path: string, platform?: unknown): Promise<Response | null>;
}
/**
 * DC-24 ④: BASE_PATH is fixed at build time (asset URLs, prerendered HTML). A different value
 * in the runtime environment is a deployment mistake reported at startup.
 */
export function checkBasePath(built: string | undefined, env: Record<string, unknown>) {
  const value = env.BASE_PATH;
  if (typeof value !== 'string') return;
  const runtime = value === '' || value === '/' ? '' : '/' + value.replace(/^\/+|\/+$/g, '');
  if (runtime !== (built ?? ''))
    throw new Error(
      `BASE_PATH is "${runtime}" at runtime but the app was built with "${built ?? ''}": asset ` +
        'URLs and prerendered HTML are fixed at build time. Rebuild with the same BASE_PATH.'
    );
}
export const contentType = (path: string) =>
  ({
    js: 'application/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json',
    html: 'text/html; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    gif: 'image/gif',
    ico: 'image/x-icon',
    woff2: 'font/woff2',
  })[path.split('.').pop()!] ?? 'application/octet-stream';
export function assetPath(request: Request, basePath = ''): string | null {
  const url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  if (basePath && !url.pathname.startsWith(basePath + '/')) return null;
  const pathname = url.pathname.slice(basePath.length);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (
    decoded.includes('\\') ||
    decoded.includes('\0') ||
    decoded.split('/').some(p => p === '..' || p.startsWith('.'))
  )
    return null;
  // HTML is owned by the core, including prerendered HTML in stage 7.
  return decoded.startsWith('/assets/') ? decoded.slice(1) : null;
}
export function assetHeaders(path: string) {
  return {
    'content-type': contentType(path),
    'cache-control': /[-.][\w-]{8,}\.[\w]+$/.test(path)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
    'x-content-type-options': 'nosniff',
  };
}
