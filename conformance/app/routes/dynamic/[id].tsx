import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Document from '../../conformance/Document';
import Fixture from '../../conformance/Fixture';

export default function Dynamic(ctx: SurfaceContext) {
  return (
    <Document>
      <Slot name="fixture:state" client:load>
        <Fixture value={ctx.params.id} />
      </Slot>
    </Document>
  );
}
