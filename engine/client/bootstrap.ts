import type { SurfaceBootstrap } from '../shared/protocol.js';

/** `<script id="__SURFACE__">`, the single bootstrap JSON (DESIGN 6.2). Invalid JSON throws. */
export function readBootstrap(root: Document = document): SurfaceBootstrap {
  const text = root.getElementById('__SURFACE__')?.textContent;
  const value = text ? (JSON.parse(text) as SurfaceBootstrap) : undefined;
  return { buildId: '', pageId: '', basePath: '', ...value };
}
