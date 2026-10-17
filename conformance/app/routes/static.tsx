import { Slot } from 'state-surface';
import Document from '../conformance/Document';
import Fixture from '../conformance/Fixture';

// No directive: a static slot, so the page needs no engine script (V-01).
export default function Static() {
  return (
    <Document>
      <Slot name="fixture:state">
        <Fixture value="static" />
      </Slot>
    </Document>
  );
}
