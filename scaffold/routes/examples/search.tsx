import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout.js';
import SearchInput from './search/_components/searchInput.js';
import SearchResults from './search/_components/searchResults.js';
import { getLang } from '../../shared/i18n.js';
import { searchContent } from '../../shared/content.js';

export default async function Page(ctx: SurfaceContext) {
  const content = searchContent(getLang(ctx));
  return (
    <Layout header={content['page:header']}>
      <main class="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 pt-4 md:pt-6">
        <Slot name="search:input" client:load>
          <SearchInput {...content['search:input']} />
        </Slot>
        <Slot name="search:results" client:load component={SearchResults} data-animate="fade" />
      </main>
    </Layout>
  );
}
