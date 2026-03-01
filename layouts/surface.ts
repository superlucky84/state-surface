import { prefixPath } from 'state-surface';
import { resolveAsset, resolveAssetCss } from '../engine/server/assets.js';

type SurfaceBlock = string | false | null | undefined;

export interface SurfaceDocumentOptions {
  title: string;
  body: string;
  styles?: string;
  stateScript?: string;
  clientEntry?: string;
  lang?: string;
}

export function stateSlots(...names: string[]): string {
  return names.map(name => `<h-state name="${name}"></h-state>`).join('\n');
}

export function joinSurface(...blocks: SurfaceBlock[]): string {
  return blocks.filter((b): b is string => typeof b === 'string' && b.length > 0).join('\n');
}

export function surfaceDocument({
  title,
  body,
  styles,
  stateScript = '',
  clientEntry = '/engine/client/main.ts',
  lang = 'en',
}: SurfaceDocumentOptions): string {
  const styleBlock = styles
    ? `<style>
${styles}
  </style>`
    : '';
  const cssLinks = resolveAssetCss('/client/styles.css')
    .map(href => `<link rel="stylesheet" href="${href}">`)
    .join('\n  ');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${cssLinks}
  ${styleBlock}
</head>
<body>
${body}
${stateScript}
  <script type="module" src="${resolveAsset(clientEntry)}"></script>
</body>
</html>`;
}

/**
 * Full-viewport layout for chat-style pages.
 * body = h-screen overflow-hidden, outer div = h-full flex-col.
 * Consumers are expected to make their main element flex-1 min-h-0.
 */
export function chatSurface(body: string, stateScript: string): string {
  const cssLinks = resolveAssetCss('/client/styles.css')
    .map(href => `<link rel="stylesheet" href="${href}">`)
    .join('\n  ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StateSurface</title>
  ${cssLinks}
</head>
<body class="h-screen overflow-hidden bg-slate-100 text-slate-900 antialiased">
<div class="mx-auto flex h-full w-full max-w-6xl flex-col px-4 pt-6 md:px-8">
<h-state name="page:header"></h-state>
${body}
<h-state name="system:error"></h-state>
</div>
${stateScript}
  <script type="module" src="${resolveAsset('/engine/client/main.ts')}"></script>
</body>
</html>`;
}

export function baseSurface(body: string, stateScript: string): string {
  const cssLinks = resolveAssetCss('/client/styles.css')
    .map(href => `<link rel="stylesheet" href="${href}">`)
    .join('\n  ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StateSurface</title>
  ${cssLinks}
</head>
<body class="min-h-screen bg-slate-100 text-slate-900 antialiased">
<div class="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-12 pt-6 md:px-8">
<h-state name="page:header"></h-state>
${body}
<h-state name="system:error"></h-state>
</div>
${stateScript}
  <script type="module" src="${resolveAsset('/engine/client/main.ts')}"></script>
</body>
</html>`;
}
