export default function Layout(
  { title }: { title: string; children?: unknown },
  children: unknown
) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>{title}</title>
      </head>
      <body>
        <nav>
          <a href="/">static</a> <a href="/actions">actions</a> <a href="/islands">islands</a>{' '}
          <a href="/plugins">plugins</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
