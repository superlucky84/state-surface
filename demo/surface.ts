type SurfaceBlock = string | false | null | undefined;

interface SurfaceDocumentOptions {
  title: string;
  body: string;
  styles?: string;
  stateScript?: string;
  clientEntry?: string;
  lang?: string;
}

function isSurfaceBlock(block: SurfaceBlock): block is string {
  return typeof block === 'string' && block.length > 0;
}

export function joinSurface(...blocks: SurfaceBlock[]): string {
  return blocks.filter(isSurfaceBlock).join('\n');
}

export function stateSlot(name: string): string {
  return `<h-state name="${name}"></h-state>`;
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

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${styleBlock}
</head>
<body>
${body}
${stateScript}
  <script type="module" src="${clientEntry}"></script>
</body>
</html>`;
}
