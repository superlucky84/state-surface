import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Document from '../conformance/Document';
import Fixture from '../conformance/Fixture';
import Value from '../conformance/Value';
import Html from '../conformance/Html';
import ErrorBox from '../conformance/ErrorBox';

export default function Index(ctx: SurfaceContext) {
  return (
    <Document>
      <Slot name="fixture:state" client:load>
        <Fixture
          value="Hello"
          runtime={String(ctx.env.RUNTIME ?? 'unknown')}
          cookie={ctx.cookies.get('lang') ?? ''}
          nonce={ctx.nonce}
        />
      </Slot>
      <Slot name="value" client:load component={Value} />
      <Slot name="fixture:html" mode="server" component={Html} />
      <Slot name="system:error" mode="server" component={ErrorBox} />
    </Document>
  );
}
