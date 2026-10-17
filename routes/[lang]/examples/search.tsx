import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../../layouts/Layout.js';
import SearchInput from './search/_components/searchInput.js';
import SearchResults from './search/_components/searchResults.js';
import { pageLang } from '../../../shared/i18n.js';
import { headerProps, searchContent } from '../../../shared/pages.js';

export default async function Page(ctx: SurfaceContext) {
  const content = await searchContent(pageLang(ctx));
  return (
    <Layout header={headerProps(ctx, { title: content.title, nav: 'examples', back: true })}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
        {/* morph keeps the typed value and focus while the form re-renders (DC-03 ③). */}
        <Slot name="search:input" mode="server" swap="morph">
          <SearchInput {...content['search:input']} />
        </Slot>
        <Slot name="search:results" mode="server" component={SearchResults} data-animate="fade" />
      </main>
    </Layout>
  );
}
