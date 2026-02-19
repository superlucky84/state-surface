import { prefixPath } from '../shared/basePath.js';

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
  clientEntry = '/client/main.ts',
  lang = 'en',
}: SurfaceDocumentOptions): string {
  const styleBlock = styles
    ? `<style>
${styles}
  </style>`
    : '';
  const stylesheetLink = `<link rel="stylesheet" href="${prefixPath('/client/styles.css')}">`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${stylesheetLink}
  ${styleBlock}
</head>
<body>
${body}
${stateScript}
  <script type="module" src="${prefixPath(clientEntry)}"></script>
</body>
</html>`;
}

/**
 * Full-viewport layout for chat-style pages.
 * body = h-screen overflow-hidden, outer div = h-full flex-col.
 * Consumers are expected to make their main element flex-1 min-h-0.
 */
export function chatSurface(body: string, stateScript: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StateSurface</title>
  <link rel="stylesheet" href="${prefixPath('/client/styles.css')}">
</head>
<body class="h-screen overflow-hidden bg-slate-100 text-slate-900 antialiased">
<div class="mx-auto flex h-full w-full max-w-6xl flex-col px-4 pt-6 md:px-8">
<h-state name="page:header"></h-state>
${body}
<h-state name="system:error"></h-state>
</div>
${stateScript}
  <script type="module" src="${prefixPath('/client/main.ts')}"></script>
</body>
</html>`;
}

export function baseSurface(body: string, stateScript: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StateSurface</title>
  <link rel="stylesheet" href="${prefixPath('/client/styles.css')}">
</head>
<body class="min-h-screen bg-slate-100 text-slate-900 antialiased">
<div class="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-12 pt-6 md:px-8">
<h-state name="page:header"></h-state>
${body}
<h-state name="system:error"></h-state>
</div>
${stateScript}
  <script type="module" src="${prefixPath('/client/main.ts')}"></script>
</body>
</html>`;
}
