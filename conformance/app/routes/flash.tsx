import type { SurfaceContext } from 'state-surface/server';
import Document from '../conformance/Document';

// JS-less form result page (PRG): reads the one-time flash.
export default async function Flash(ctx: SurfaceContext) {
  const flash = JSON.stringify((await ctx.flash('form/submit')) ?? null);
  return (
    <Document>
      <pre class="flash">{flash}</pre>
    </Document>
  );
}
