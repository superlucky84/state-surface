import type { SurfaceContext } from 'state-surface/server';
import RouterLayout from '../../layouts/RouterLayout';

// No counter island: the persisted counter has no pair here and is disposed.
export default async function Page(ctx: SurfaceContext) {
  return (
    <RouterLayout title="Router C" nonce={ctx.nonce} counter={false}>
      <main>
        <h1>Page C</h1>
      </main>
    </RouterLayout>
  );
}
