/**
 * Demo HTML layout with <h-state> anchors.
 * Used for both SSR rendering and as the shell template.
 */
export function demoLayout(body: string, stateScript: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StateSurface Demo</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .site-header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
    .site-header h1 { font-size: 1.5rem; }
    .site-header nav { margin-top: 8px; }
    .site-header nav a { color: #0066cc; text-decoration: none; }
    .loading { color: #888; padding: 20px 0; }
    .article-content h2 { margin-bottom: 8px; }
    .article-content p { line-height: 1.6; }
    .comments { margin-top: 24px; border-top: 1px solid #ddd; padding-top: 16px; }
    .comments h3 { margin-bottom: 8px; }
    .comment { margin-bottom: 6px; }
    .search-input { margin-bottom: 16px; }
    .search-input input { padding: 8px; width: 100%; font-size: 1rem; }
    .search-results { list-style: none; }
    .search-results li { padding: 8px 0; border-bottom: 1px solid #eee; }
    .search-results a { color: #0066cc; text-decoration: none; }
    .no-results { color: #888; padding: 12px 0; }
    .error-panel { background: #fee; border: 1px solid #c00; padding: 12px; color: #900; margin: 12px 0; }
    h-state { display: block; }
    .demo-controls { margin-top: 32px; padding-top: 16px; border-top: 2px solid #333; }
    .demo-controls button { margin-right: 8px; padding: 8px 16px; cursor: pointer; }
  </style>
</head>
<body>
  <h-state name="page:header"></h-state>
  <h-state name="page:content"></h-state>
  <h-state name="panel:comments"></h-state>
  <h-state name="search:input"></h-state>
  <h-state name="search:results"></h-state>
  <h-state name="system:error"></h-state>

  <div class="demo-controls">
    <h3>Demo Controls</h3>
    <button data-action="article-load" data-params='{"articleId":1}'>Load Article #1</button>
    <button data-action="article-load" data-params='{"articleId":2}'>Load Article #2</button>
    <button data-action="search" data-params='{"query":"lithent"}'>Search "lithent"</button>
    <button data-action="search" data-params='{"query":"state"}'>Search "state"</button>
  </div>

  ${stateScript}
  <script type="module" src="/client/main.ts"></script>
</body>
</html>`;
}

/**
 * Shell layout with all anchors (no content, no __STATE__).
 */
export function demoShell(): string {
  return demoLayout('', '');
}
