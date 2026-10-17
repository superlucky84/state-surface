export default function Document(
  { title = 'Fixture' }: { title?: string; children?: unknown },
  children: unknown
) {
  return (
    <html>
      <head>
        <title>{title}</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
