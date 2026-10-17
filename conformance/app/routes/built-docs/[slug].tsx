import type { SurfaceContext } from 'state-surface/server';
import Document from '../../conformance/Document';

export const prerender = true;

export function getStaticPaths() {
  return [{ slug: 'one' }];
}

export default function BuiltDoc(ctx: SurfaceContext) {
  return (
    <Document>
      <p>built-marker /built-docs/{ctx.params.slug}</p>
    </Document>
  );
}
