import { Slot } from 'state-surface';
import Document from '../conformance/Document';
import Deferred from '../conformance/Deferred';

export default function DeferredPage() {
  return (
    <Document>
      <Slot
        name="fixture:defer"
        mode="server"
        server:defer
        cache="public, max-age=60"
        fallback={<p>Loading</p>}
      >
        <Deferred label="secret-label" />
      </Slot>
    </Document>
  );
}
