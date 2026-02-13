type SurfaceBlock = string | false | null | undefined;

export function stateSlots(...names: string[]): string {
  return names.map(name => `<h-state name="${name}"></h-state>`).join('\n');
}

export function joinSurface(...blocks: SurfaceBlock[]): string {
  return blocks.filter((b): b is string => typeof b === 'string' && b.length > 0).join('\n');
}

export function baseSurface(body: string, stateScript: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StateSurface</title>
</head>
<body>
<h-state name="page:header"></h-state>
${body}
<h-state name="system:error"></h-state>
${stateScript}
<script type="module" src="/client/main.ts"></script>
</body>
</html>`;
}
