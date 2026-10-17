import type { SurfaceContext } from 'state-surface/server';
import RouterLayout from '../../layouts/RouterLayout';

export default async function Page(ctx: SurfaceContext) {
  const q = ctx.url.searchParams.get('q') ?? '';
  const sort = ctx.url.searchParams.get('sort') ?? '';
  return (
    <RouterLayout title="Search" nonce={ctx.nonce}>
      <main>
        <h1 id="results">
          {q}:{sort}
        </h1>
      </main>
    </RouterLayout>
  );
}
