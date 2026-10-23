---
title: Template
order: 3
demoHref: /examples/actions
demoLabel: Actions Playground
---

## TL;DR {#tldr}

A Template is the component inside a `<Slot>`. Its props **are** the slot state: the page passes the first props, and transitions send new ones under `states['slot:name']`. It doesn't fetch data or manage server state — it renders what it receives. In a server slot it runs on the server for every update; in a client slot it is rendered once on the server (unless `client:only`), then hydrated and updated in the browser by Lithent.

## Mental model {#analogy}

:::analogy
A Template is a TV screen. The remote (Action) picks a channel, the station (Transition) sends the signal, and the screen (Template) shows whatever arrives. The screen records nothing of its own: when the signal changes, the picture changes.
:::

Think of it as a React component whose props are decided by the server, not by the component. There is no `useState` for server data, no `useEffect` to fetch, no context provider. The page render, every transition update and deferred slots call the same function with props; only the output differs — HTML for server slots, a DOM diff for client slots.

:::callout{kind="tip"}
The loading prop pattern: let the transition’s first frame send `{ loading: true }` to show a skeleton, and the next frame the real data. The server controls the loading UX timing completely.
:::

## When to use {#when}

- Every `<Slot>` has one: its child element, or the `component={X}` of an empty slot.
- A plain synchronous function component is the default. In a `mode="server"` slot none of its code reaches the browser.
- `defineServerComponent({ load, render })` from `state-surface/server` when the template should look its data up itself: the slot state is the `load` input (an id, a symbol) and `render` receives the result.
- A Lithent `mount` component in a `client:*` slot or island only for local state, browser APIs or `useAction`.
- Don't copy server-driven data into local state — read props. Content that never changes belongs in page markup.

## Step-by-step {#steps}

:::sequence
1. Create `routes/dashboard/_components/stockPrice.tsx` — folders starting with `_` are not pages.
2. Define a `Props` type: the shape the page passes and transitions send under `states['stock:price']`.
3. Write a synchronous function component that renders from props only, and default-export it.
4. Import it statically in the page and make it the only child of `<Slot name="stock:price" mode="server">`. Fixed text goes in props, not in JSX children.
5. Send the same shape from a transition: `yield { type: 'state', states: { 'stock:price': { … } } }`.
6. Need local state or browser APIs? Write it with Lithent `mount` and give the Slot a `client:*` directive instead of `mode="server"`.
:::

## Minimal example {#example}

```tsx label="✓ StateSurface — 16 lines"
// routes/dashboard/_components/stockPrice.tsx — child of <Slot name="stock:price" mode="server">
type Props = { symbol: string; price: number; change: number; loading?: boolean };

export default function StockPrice({ symbol, price, change, loading }: Props) {
  if (loading) return <div class="h-20 animate-pulse rounded-xl bg-slate-100" />;
  return (
    <div class="rounded-xl border p-4">
      <span class="text-sm text-slate-500">{symbol}</span>
      <p class="text-2xl font-bold">${price.toFixed(2)}</p>
      <span class={change > 0 ? 'text-green-600' : 'text-red-600'}>
        {change > 0 ? '+' : ''}
        {change.toFixed(2)}%
      </span>
    </div>
  );
}
```

:::callout{kind="info"}
**Invisible Power** — what this stateless function gets for free:

- ✓ No `useState` — the server sends data through state frames
- ✓ No `useEffect` — no client-side fetch
- ✓ No `AbortController` — the engine aborts overlapping requests
- ✓ Page SSR and every transition update call the same function; in a server slot it ships zero JavaScript
- ✓ Re-renders only when `stock:price` receives new state
:::

```tsx label="Traditional approach — 43 lines, manual fetch + lifecycle management" collapsible
// React-style stock price component
import { useState, useEffect, useRef } from 'react';

function StockPrice({ symbol }: { symbol: string }) {
  const [data, setData] = useState<{ price: number; change: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    fetch(`/api/stock/${symbol}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => {
        if (e.name === 'AbortError') return;
        // ⚠️ every data component repeats this fetch, abort, loading and error handling
        setError(e.message);
        setLoading(false);
      });

    return () => controller.abort();
    // ⚠️ forget the cleanup or the AbortError check and fast switches show stale data or errors
  }, [symbol]);

  if (loading) return <div className="animate-pulse h-20 bg-slate-100 rounded-xl" />;
  if (error) return <div className="text-red-600">{error}</div>;
  // ⚠️ plus an /api/stock endpoint to build and keep in sync with this component
  return (
    <div className="rounded-xl border p-4">
      <span className="text-sm text-slate-500">{symbol}</span>
      <p className="text-2xl font-bold">${data!.price.toFixed(2)}</p>
      <span className={data!.change > 0 ? 'text-green-600' : 'text-red-600'}>
        {data!.change > 0 ? '+' : ''}{data!.change.toFixed(2)}%
      </span>
    </div>
  );
}
```

```tsx label="Server component — the slot state is the load input"
// routes/dashboard/_components/stockNews.tsx — child of <Slot name="stock:news" mode="server">
// A transition sends the load input: states: { 'stock:news': { symbol: 'AAPL' } }
import { defineServerComponent, type SurfaceContext } from 'state-surface/server';
import { latestNews, type NewsItem } from '../../../shared/news.server.js';

type NewsData = { items: NewsItem[] };

const StockNews = defineServerComponent({
  // Runs again for every render of the slot and is cancelled with ctx.signal.
  load: async ({ symbol }: { symbol: string }, ctx: SurfaceContext): Promise<NewsData> => ({
    items: await latestNews(symbol, ctx.signal),
  }),
  render: ({ items }: NewsData) => (
    <ul class="space-y-2">
      {items.map(item => (
        <li key={item.id}>
          <a href={item.url}>{item.title}</a>
        </li>
      ))}
    </ul>
  ),
});

export default StockNews;
```

```tsx label="Client component — local state, live props and useAction"
// routes/dashboard/_components/stockChart.tsx — child of <Slot name="stock:chart" client:visible>
import { mount } from 'lithent';
import { useAction } from 'state-surface/client';
import Sparkline from './sparkline.js';

type Props = { symbol: string; points: number[] };

const StockChart = mount<Props>((renew, props) => {
  let expanded = false; // local state: survives props updates
  const refresh = useAction(renew, 'dashboard-load');
  const toggle = () => {
    expanded = !expanded;
    renew();
  };
  // Read props inside the render function: props.points is always the latest value.
  return () => (
    <figure class={expanded ? 'h-96' : 'h-40'}>
      <Sparkline points={props.points} />
      <button type="button" onClick={toggle}>
        {expanded ? 'Collapse' : 'Expand'}
      </button>
      <button
        type="button"
        disabled={refresh.pending}
        onClick={() => void refresh.run({ symbol: props.symbol })}
      >
        {refresh.pending ? 'Refreshing…' : 'Refresh'}
      </button>
    </figure>
  );
});

export default StockChart;
```

## Execution sequence {#sequence}

:::sequence
1. A transition yields `{ type: 'state', states: { 'stock:price': { symbol, price, change } } }`.
2. The server’s request reducer applies the frame and checks it against the transition’s targets and the page’s slots.
3. Server slot: the engine runs `load` (for a server component) and renders the template to HTML with the slot’s capability, sent as an `html` op. Client slot: the props go out as a `props` op, or as `merge` for accumulate frames.
4. The browser coalesces ops once per animation frame and applies them inside `<h-state name="stock:price">`: an HTML swap (`replace` or `morph`) or a Lithent diff of the mounted instance.
5. Plugins get `attach` or `update`, and the slot’s `data-pending` mark clears when the request ends.
:::

:::callout{kind="info"}
Full and partial frames replace a slot’s props; accumulate frames merge deltas into them (arrays and strings concatenate, other values replace). These options belong to transitions — see the [Transition guide](/en/guide/transition).
:::

## Common mistakes {#mistakes}

:::warning
Slot props are replaced, not merged. Every request starts with empty state and the server never sees the props the page rendered, so a frame sends the whole props object of a slot — `{ symbol, price, change }`, not just `{ price }`. Use accumulate frames only for real deltas such as streamed text.
:::

:::checklist
- The component is statically imported and is the only child of its `<Slot>` (or its `component={X}`), with no JSX children.
- Its `Props` type matches what the page passes and what transitions send under the slot name.
- It renders synchronously; async data lives in the page function or in a server component’s `load`.
- Lists use a stable `key`.
- No server-driven data in local state; client components read `props.x` inside the render function.
- Client components render empty text as `null`, not `''`.
- Props of client slots and islands are plain JSON values — they are written into `__SURFACE__`.
:::

## Troubleshooting {#debug}

:::debug{symptom="The slot keeps its old content after an action, or the error slot shows a frame error." cause="The states key differs from the Slot name, the Slot is static, or the slot is outside the transition targets."}
Copy the name from `<Slot name>` into `states`, give the Slot `mode="server"` or a `client:*` directive and add the name to `targets`. Open the page with `?debug=1` to watch the received, applied and dropped ops of each request.
:::

:::debug{symptom="Content renders on first load but loses fields after a transition." cause="The frame sends only part of the props: slot state is replaced, not merged with what the page rendered."}
Send the complete props object and keep the `Props` type in sync with the transition’s `states`. For a server component, send its `load` input (`{ symbol }`), not the rendered data.
:::

:::debug{symptom="A client component shows stale values, or an empty text never fills in after hydration." cause="Props were destructured once in the mount callback, or the first render printed an empty string."}
Read `props.x` inside the returned render function instead of destructuring it at mount. Render `null` instead of `''`: Lithent hydration cannot fill an empty SSR text node later. Keep browser-only values (`window`, `Date.now()`) out of the first render — use event handlers or `mountCallback`.
:::

:::debug{symptom="The build rejects a defineServerComponent template." cause="It is used outside a server Slot — as the child of a client Slot, as an island or directly in markup."}
Only the child (or `component`) of a `<Slot mode="server">` can be a server component. For the browser, write a regular component and send its data as props.
:::

## Scoped CSS {#styles}

Put utilities in the markup and give a component its own `*.module.css` file for what utilities express poorly — container queries, complex selectors, keyframes. Class names are hashed per file, so they apply only where the component uses them (`:global()` opts out). The build links what a page needs: CSS Modules of static and server components go into the page stylesheet in `<head>`, an island's CSS ships with its chunk and is linked before the island activates, and client navigation loads the next page's stylesheets before the swap. SSR, server HTML swaps and client renders import the same module, so the class names always match.

```tsx label="✓ Card.tsx — utilities plus a CSS Module"
import s from './Card.module.css';

export default function Card({ title }: { title: string }) {
  return (
    <section class={`${s.card} rounded-lg p-4`}>
      <div class={s.body}>{title}</div>
    </section>
  );
}
```

```css label="Card.module.css — @apply needs @reference to the app CSS (path relative to this file)"
/* routes/dashboard/_components/Card.module.css */
@reference "../../../client/styles.css";

.card {
  container-type: inline-size;
  @apply shadow-sm;
}

/* A container query matches ancestors, not the container itself: lay out the child. */
@container (min-width: 32rem) {
  .body {
    @apply grid grid-cols-2 gap-4;
  }
}
```

:::callout{kind="tip"}
Keep `@apply` for what belongs together in the module; plain styling stays as utilities in the markup. The guide pages style their Markdown prose this way (`routes/[lang]/guide/_components/guideProse.module.css`).
:::

## Plugin Patterns {#plugins}

Plugins do browser-only DOM work after a slot renders — scroll position, observers, focus, third-party widgets — that a template cannot express. Define one with `definePlugin` from `state-surface/client` and declare it on the page (or its layout) with `export const plugins = [...]`; only those pages load its chunk. `attach(el, info)` runs when the slot DOM is ready (SSR display, client activation, every `swap="replace"`) and may return a cleanup; `update(el, info)` runs when the same DOM changed (`swap="morph"`, client props). `onPage` and `onAction` receive page-level events.

:::warning
Anti-pattern: never make state decisions, network calls or start transitions inside `attach` or `update`. Plugins observe and enhance the slot DOM — they don't drive it, restructure it or touch the inside of client islands, which Lithent owns. State logic stays in transitions; rendering stays in templates.
:::

```ts label="✓ chatScroll — client/plugins/chatScroll.ts"
import { definePlugin } from 'state-surface/client';

export const chatScroll = definePlugin({
  name: 'chat-scroll',
  slots: ['chat:messages'], // literal, read by the build; omit for every slot of the page
  load: 'load', // 'load' | 'idle' (default) | 'visible'
  attach(el) {
    el.scrollTop = el.scrollHeight; // slot DOM is ready: SSR, activation, replace
  },
  update(el) {
    el.scrollTop = el.scrollHeight; // the same DOM changed: morph, client props
  },
});
```

```ts label="✓ tocHighlight — a cleanup for the observer"
import { definePlugin } from 'state-surface/client';

export const tocHighlight = definePlugin({
  name: 'toc-highlight',
  slots: ['guide:toc'],
  attach(el) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const link = el.querySelector(`a[href="#${entry.target.id}"]`);
        link?.toggleAttribute('data-active', entry.isIntersecting);
      }
    });
    for (const link of el.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const section = document.getElementById(link.hash.slice(1));
      if (section) observer.observe(section);
    }
    return () => observer.disconnect(); // runs before this DOM is replaced or removed
  },
});
```

```tsx label="✓ Declare plugins on the page"
// routes/chat.tsx — only pages that declare a plugin (or use a layout that does) load it
import { chatScroll } from '../client/plugins/chatScroll.js';

export const plugins = [chatScroll];
```

:::callout{kind="tip"}
Decision guide — CSS only: when a selector can do it (`data-animate` presets, `h-state[data-pending]` styles). Template change: when the rendered output itself should differ. Server first: highlighting or formatting that the server can do ships no client code. Plugin: only for DOM work that needs the browser after render — scroll position, focus, observers, third-party widgets.
:::

## Next: try it live {#next}

Go to the [Actions Playground](/en/examples/actions) to see templates re-rendered by user interactions: buttons and forms drive server slots through the action → transition → frame → DOM pipeline, `LikeButton` is a client island using `useAction`, and `LikesPanel` is a server component whose `load` reads the store. Next, the [Transition guide](/en/guide/transition) shows how frames produce these props.
