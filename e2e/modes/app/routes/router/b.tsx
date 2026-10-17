import type { SurfaceContext } from 'state-surface/server';
import { Boot, Slot } from 'state-surface';
import RouterLayout from '../../layouts/RouterLayout';
import Note from '../_components/Note';

// A page with a server slot, a data-action button and a <Boot> (it pings once on load).
export default async function Page(ctx: SurfaceContext) {
  return (
    <RouterLayout title="Router B" nonce={ctx.nonce}>
      <main>
        <h1>Page B</h1>
        <Slot name="note" mode="server">
          <Note text="static note" />
        </Slot>
        <button type="button" data-action="ping" data-params='{"n":1}'>
          Ping
        </button>
        <Boot transition="ping" />
      </main>
    </RouterLayout>
  );
}
