---
title: Surface
order: 2
demoHref: /examples/streaming
demoLabel: Streaming Demo
---

## TL;DR {#tldr}

A Surface is the page itself: `export default async function Page(ctx)` in `routes/**/*.tsx`, returning the whole document as JSX. Wrap every region that may change after the page loads in `<Slot name="ns:name">` — like marking “content goes here” on a blueprint. Everything outside the slots is plain server markup that never changes during the visit; only the slot contents update.

## Mental model {#analogy}

:::analogy
Think of a Surface as the building skeleton before interior work: it fixes the rooms and drills the power outlets. Each `<Slot>` is an outlet with a name plate (`stock:price`). Templates are the appliances you plug in, and transitions address the outlets by name. The walls never move; what is plugged in can change any time.
:::

Why “Surface”? The name refers to the visible surface of a page — a real HTML surface with named boundaries, not a JavaScript bundle that paints the page. The page function body is a server script that runs for every request (await your data there), and the JSX it returns is the markup. Transitions never run the page function again: they only send new state to the slots.

:::callout{kind="note"}
Only the page function may be `async`. Layouts and components render synchronously — a component that returns a Promise is an SSR error. Await data in the page body and pass it down as props, or give a server slot a `defineServerComponent` child with a `load` step.
:::

## When to use {#when}

- Page markup without a Slot: layout, navigation, headings, footers — anything that stays the same while the user is on the page. It is server HTML only and ships no JavaScript.
- `mode="server"`: the default for content a transition changes. The server re-renders the component and sends HTML; `swap="morph"` keeps typed input and focus.
- `client:load`, `client:idle`, `client:visible`, `client:media="(…)"` or `client:only`: a Lithent component that hydrates in the browser (`client:only` skips SSR, shows `fallback` and renders on activation), keeps local state and receives props. Use it only where the region needs browser state or APIs.
- No mode and no directive means **static**: a named region rendered once, which frames cannot change.
- `server:defer` with a `fallback` loads a slow server slot after the page; `capability="rich"` or `capability="unsafe"` allows Markdown or raw HTML inside a slot (strict by default).
- Page options are named exports: `plugins` (see the Template guide), `prerender` and `getStaticPaths` for static HTML.

## Step-by-step {#steps}

:::sequence
1. Create `routes/dashboard.tsx`: the file path is the URL (`/dashboard`). `[id].tsx` segments become `ctx.params`, and files or folders starting with `_` are not pages.
2. Default-export `async function Page(ctx: SurfaceContext)` and await what the first paint needs (`ctx.params`, `ctx.url`, your database).
3. Return the document through a layout such as `layouts/Layout.tsx`, which renders `<html>`, `<head>` and `<body>`; the engine adds the doctype and stylesheets, and the bootstrap JSON and engine script when the page needs them.
4. Wrap each region that may change in `<Slot name="ns:name">` with exactly one imported component element as its child; that element’s props are the initial slot state. Use `component={X}` for a slot that starts empty.
5. Pick the mode of every slot: `mode="server"`, a `client:*` directive, or nothing for static content.
6. Stream data right after load with `<Boot transition="…" />` or bind actions in your templates, then write the transition that sends `states` for these slot names.
:::

```tsx label="layouts/Layout.tsx — the document shell"
import { Slot } from 'state-surface';
import SystemError from '../routes/_shared/components/systemError.js';

// A synchronous component: data arrives as props, the page content as children.
export default function Layout(
  { title }: { title: string; children?: unknown },
  children: unknown
) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        {/* Optional: <ClientRouter /> here turns links between pages into client navigations. */}
      </head>
      <body class="min-h-screen bg-slate-100 text-slate-900">
        {children}
        {/* Error frames render here with { message } props. */}
        <Slot name="system:error" mode="server" component={SystemError} />
      </body>
    </html>
  );
}
```

## Minimal example {#example}

```tsx label="✓ StateSurface — 25 lines"
// routes/dashboard.tsx — GET /dashboard, three panels that update independently
import type { SurfaceContext } from 'state-surface/server';
import { Boot, Slot } from 'state-surface';
import Layout from '../layouts/Layout.js';
import StockPrice from './dashboard/_components/stockPrice.js';
import StockNews from './dashboard/_components/stockNews.js';
import StockChart from './dashboard/_components/stockChart.js';

export default async function Page(ctx: SurfaceContext) {
  const symbol = ctx.url.searchParams.get('symbol') ?? 'AAPL';
  return (
    <Layout title="Stock Dashboard">
      <main class="mx-auto grid max-w-6xl grid-cols-3 gap-4 p-6">
        <Slot name="stock:price" mode="server">
          <StockPrice symbol={symbol} price={0} change={0} loading />
        </Slot>
        <Slot name="stock:news" mode="server" component={StockNews} />
        <Slot name="stock:chart" client:visible>
          <StockChart symbol={symbol} points={[]} />
        </Slot>
        <Boot transition="dashboard-load" params={{ symbol }} />
      </main>
    </Layout>
  );
}
```

:::callout{kind="info"}
**Invisible Power** — what these lines do automatically:

- ✓ Each panel is its own update boundary — a frame for `stock:price` never re-renders the news or the chart
- ✓ Adding a panel = one `<Slot>` + one component file
- ✓ Markup outside the slots is server HTML only: no JavaScript, no hydration
- ✓ Server slots ship no component code; `stock:chart` loads its chunk (and Lithent) only when it scrolls into view
- ✓ `<Boot>` streams the real data right after the first paint — no client fetch code
:::

```tsx label="Traditional approach — 33 lines, manual state + coupled re-renders" collapsible
// React-style dashboard — each panel manages its own data
import { useState, useEffect } from 'react';
import { StockPrice } from './StockPrice';
import { StockNews } from './StockNews';
import { StockChart } from './StockChart';

function Dashboard() {
  const [priceData, setPriceData] = useState(null);
  const [newsData, setNewsData] = useState(null);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetchPrice().then(setPriceData);
  }, []);
  useEffect(() => {
    fetchNews().then(setNewsData);
  }, []);
  useEffect(() => {
    fetchChart().then(setChartData);
    // ⚠️ BUG: No cleanup — stale setState calls after unmount
  }, []);

  // ⚠️ BUG: Parent re-renders when ANY child state changes
  // All 3 panels re-render even when only price updated
  return (
    <div className="grid grid-cols-3 gap-4">
      <StockPrice data={priceData} loading={!priceData} />
      <StockNews data={newsData} loading={!newsData} />
      <StockChart data={chartData} loading={!chartData} />
    </div>
  );
}
// + 3 child component files, each with their own fetch logic
```

## Two layout patterns {#mixed}

`<Slot>` is an ordinary JSX element: put it anywhere in page or layout markup — between static headings, inside sections, side by side. Slots cannot be nested, and slot names are unique per page, layout included. A client component that no transition updates needs no Slot at all: put the directive on the component itself and it becomes an island.

```tsx label="Pattern A — static markup around server slots"
<main class="flex flex-col gap-8">
  <Slot name="page:hero" mode="server">
    <PageHero title={hero.title} description={hero.description} />
  </Slot>
  <section class="border-t border-slate-200 pt-8">
    <h2 class="text-lg font-semibold">Core Concepts</h2>
    <Slot name="page:concepts" mode="server">
      <PageConcepts concepts={concepts} />
    </Slot>
  </section>
</main>
```

```tsx label="Pattern B — server slot, client slot and an island on one page"
<main class="flex flex-col gap-4">
  {/* Server slot: transitions send props, the browser receives HTML */}
  <Slot name="chat:messages" mode="server">
    <ChatMessages messages={messages} />
  </Slot>
  {/* Client slot: starts empty, receives props and merge deltas */}
  <Slot name="chat:current" client:load component={ChatCurrent} />
  {/* Island: a client component without a slot name, never a transition target */}
  <LikeButton client:idle count={likes} />
</main>
```

:::callout{kind="tip"}
Pattern A is the default: static headings, dividers and decorations are baked into the HTML and never re-render, and server slots ship no component code. Use Pattern B’s client slot or island only where local state or browser APIs are needed. With the default `swap="replace"`, an island inside a server slot is recreated whenever that slot is re-rendered; with `swap="morph"` it keeps its instance when its props (or its `resetKey` values) are unchanged.
:::

## Execution sequence {#sequence}

:::sequence
1. `GET /dashboard` — the server matches `routes/dashboard.tsx` and runs the middleware.
2. The page function runs with `ctx` and returns the tree; the engine collects its Slots, islands and `<Boot>` elements.
3. The `load` steps of the page’s server components are awaited in parallel, then the tree renders to HTML, each slot inside an `<h-state name="…">` host.
4. The engine adds the doctype and stylesheets and, only if the page needs the engine (client components, actions, `<Boot>`, deferred slots, plugins, `<ClientRouter>`) or has `client/entry.ts`, the `__SURFACE__` bootstrap JSON and the engine script.
5. The browser shows the complete page (MPA). Client slots hydrate at their own timing from the snapshot props (`client:only` ones render), deferred slots are fetched and `<Boot>` transitions start.
:::

## Common mistakes {#mistakes}

:::warning
The most common mistake in 2.0: a `<Slot>` without `mode` or a `client:*` directive is **static**. It renders once, and a transition that targets it fails with `slot "stock:price" is static and cannot be updated`.

The second most common one is hardcoding content that changes into page markup. Anything that may change while the user stays on the page belongs in a Slot.
:::

:::checklist
- Every region a transition changes is a `<Slot>` with `mode="server"` or a `client:*` directive.
- Each `<Slot>` has exactly one statically imported component element as its child (or `component={X}`), and that element has no JSX children.
- Slot names follow `ns:name` (`[a-z0-9-]+(:[a-z0-9-]+)*`) and are unique across the page and its layout.
- Transitions use the slot names as `states` keys and send the child’s props shape.
- Async work happens in the page function or a server component’s `load`, never in a component.
- The layout renders `<html>`, `<head>` and `<body>` exactly once each.
:::

## Troubleshooting {#debug}

:::debug{symptom="The build fails with “needs exactly one component element as its child”." cause="The Slot wraps text, a fragment, a condition or several elements."}
Move that markup into one component and pass the data as props; put conditions inside the component. For a slot that starts empty, use `component={X}` instead of a child.
:::

:::debug{symptom="An action fails with “slot … is static and cannot be updated” or “is not on page”." cause="The Slot has no mode, its name differs from the states key, or the page that ran the action does not render the slot."}
Add `mode="server"` or a client directive, compare the names character for character (colon included) and check that the page renders the slot. The development error names the transition, the frame number and the slot.
:::

:::debug{symptom="SSR fails with “… returned a Promise”." cause="An async component: components render synchronously, so a Promise would render nothing."}
Await the data in the page function and pass it down as props, or turn the component into `defineServerComponent({ load, render })` inside a `mode="server"` Slot.
:::

:::debug{symptom="A slot is empty on first load." cause="It is declared with the component prop and no child, so it stays empty until the first frame — or it is client only and shows its fallback."}
That is by design. Give the Slot a child element with initial props for the first paint, or start a `<Boot>` transition that fills it right after load.
:::

## Next: try it live {#next}

Open the [Streaming Demo](/en/examples/streaming) to watch three slots update independently in real time — full frames replace every target slot, partial frames patch only the changed ones. Then read the [Template guide](/en/guide/template) for what goes inside a slot.
