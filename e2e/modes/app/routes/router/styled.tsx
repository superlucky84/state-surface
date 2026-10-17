import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import RouterLayout from '../../layouts/RouterLayout';
import Badge from '../_components/Badge';
import Toggle from '../_components/Toggle';

// DC-23: CSS Modules in a static slot, a server slot and an island on one router page.
export default async function Page(ctx: SurfaceContext) {
  return (
    <RouterLayout title="Styled" nonce={ctx.nonce} counter={false}>
      <main>
        <Slot name="badge">
          <Badge id="badge" text="styled" />
        </Slot>
        <Slot name="live" mode="server">
          <Badge id="live" text="waiting" />
        </Slot>
        <button type="button" data-action="restyle">
          Restyle
        </button>
        <Toggle client:visible label="toggle" />
      </main>
    </RouterLayout>
  );
}
