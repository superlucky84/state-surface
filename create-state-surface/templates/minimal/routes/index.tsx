import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../layouts/Layout';
import Greeting from './_components/Greeting';
import Counter from './_components/Counter';

/**
 * A page is a function of the request. It renders three kinds of content:
 * - static markup (HTML only, no JavaScript),
 * - a server slot that transitions update with new HTML (`transitions/greet.ts`),
 * - a client island that hydrates in the browser.
 */
export default function Home(_ctx: SurfaceContext) {
  return (
    <Layout title="StateSurface">
      <main class="mx-auto max-w-xl space-y-8 px-6 py-12">
        <header class="space-y-2">
          <h1 class="text-3xl font-semibold tracking-tight">Hello, StateSurface</h1>
          <p class="text-slate-600">
            The server owns the state, the browser owns the DOM. Edit <code>routes/index.tsx</code>{' '}
            to start.
          </p>
        </header>

        <section class="space-y-3">
          <Slot name="home:greeting" mode="server">
            <Greeting name="world" />
          </Slot>
          <form data-action="greet" class="flex gap-2">
            <input
              name="name"
              placeholder="Your name"
              class="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2"
            />
            <button type="submit" class="rounded-md bg-slate-900 px-4 py-2 text-white">
              Greet
            </button>
          </form>
        </section>

        <Counter start={0} client:visible />
      </main>
    </Layout>
  );
}
