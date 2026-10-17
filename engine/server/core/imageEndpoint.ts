import {
  allowedRemote,
  DEFAULT_WIDTHS,
  type ImageConfig,
  type ImageFormat,
} from '../../shared/image.js';

/**
 * Resizes images for `/_surface/image` (DC-26). Node, Bun and Deno provide one
 * (`engine/images/service.ts`, sharp with a disk cache); Workers have none and use original
 * URLs. The core only validates the request, so it stays free of runtime APIs.
 */
export interface ImageService {
  transform(
    source: { url: string } | { file: string },
    width: number,
    format: ImageFormat
  ): Promise<{ body: Uint8Array; type: string }>;
}

const FORMATS = new Set<ImageFormat>(['webp', 'avif', 'png', 'jpeg']);

const fail = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * `GET /_surface/image?url=<remote>&w=<width>&f=<format>`: an allowed remote URL
 * (`images.remotePatterns`) at a configured width. Dev also serves local files
 * (`?src=<project path>`) for imported images, which builds write as static files.
 */
export async function imageResponse(
  url: URL,
  config: Partial<ImageConfig> | undefined,
  service: ImageService | undefined,
  development: boolean
): Promise<Response> {
  if (!service) return fail(404, 'Image transforms are not available on this runtime.');
  const params = url.searchParams;
  const width = Number(params.get('w'));
  const format = params.get('f') as ImageFormat;
  const remote = params.get('url');
  const local = development ? params.get('src') : null;
  if (!Number.isInteger(width) || width < 1 || width > 8192) return fail(400, 'Invalid width.');
  if (!FORMATS.has(format)) return fail(400, 'Invalid format.');
  let source: { url: string } | { file: string };
  if (remote) {
    const formats = config?.formats ?? ['webp'];
    if (!formats.includes(format) && format !== 'webp') return fail(400, 'Format not enabled.');
    if (!(config?.widths ?? DEFAULT_WIDTHS).includes(width))
      return fail(400, 'Width is not in images.widths.');
    if (!allowedRemote(remote, config?.remotePatterns ?? []))
      return fail(403, 'Host is not in images.remotePatterns.');
    source = { url: remote };
  } else if (local) {
    if (!/^\/[^\0\\]+\.(?:png|jpe?g|webp|avif)$/i.test(local) || local.split('/').includes('..'))
      return fail(400, 'Invalid source.');
    source = { file: local };
  } else return fail(400, 'Missing url.');
  try {
    const { body, type } = await service.transform(source, width, format);
    return new Response(body as BodyInit, {
      headers: {
        'content-type': type,
        'x-content-type-options': 'nosniff',
        'cache-control': remote
          ? 'public, max-age=86400, stale-while-revalidate=604800'
          : 'no-cache',
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    return fail(status && status >= 400 ? status : 502, 'The image could not be transformed.');
  }
}
