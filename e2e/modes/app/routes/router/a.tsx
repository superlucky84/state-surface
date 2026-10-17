import type { SurfaceContext } from 'state-surface/server';
import RouterLayout from '../../layouts/RouterLayout';

export default async function Page(ctx: SurfaceContext) {
  return (
    <RouterLayout title="Router A" nonce={ctx.nonce}>
      <main>
        <h1>Page A</h1>
        <form id="search" action="/router/search">
          <input name="q" value="lithent" />
          <button id="search-go" name="sort" value="new">
            Search
          </button>
        </form>
        <div style="height: 3000px">tall</div>
        <p id="bottom">bottom</p>
        {/* Observed until it scrolls into view (observer lifetime across navigations). */}
        <a id="far" href="/router/search?q=far" data-prefetch="viewport">
          far
        </a>
      </main>
    </RouterLayout>
  );
}
