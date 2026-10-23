---
title: Transition
order: 4
demoHref: /examples/streaming
demoLabel: Streaming Demo
---

## TL;DR {#tldr}

A transition is a server function that streams UI state step by step. It lives in `transitions/**/*.ts`, and each `yield` sends one state frame: the props of one or more slots. Yield a loading skeleton first and the real data when it is ready — the order you yield is the order the user sees. When the handler returns, the engine sends `done`; when it throws, the user sees an error message.

## Mental model {#analogy}

:::analogy
Think of a transition as the live subtitle feed of a video. The video — the HTML page — stays where it is; only the subtitles stream in, line by line. Each `yield` is one line: the engine sends it over the open HTTP response, and the browser shows it in the matching `<h-state>` right away.
:::

Why “Transition”? It is the server-side move from one UI state to the next: loading, then partly loaded, then done. It has nothing to do with CSS transitions or the View Transition API (a transition can opt into View Transitions, see Animation presets below). If the name trips you up, read it as “state stream”.

:::callout{kind="info"}
Why POST instead of GET? A transition runs server logic now: it reads the request body, cookies and services, and it may write data. GET responses get cached, prefetched and bookmarked; an in-page update should be none of these. The engine also checks `Origin` on every transition request.
:::

## When to use {#when}

- Use for every in-page update the server decides: loading data, form submissions, button clicks, the progress of a long job.
- Use for progressive rendering: a skeleton first, then cached data, then fresh data — always in that order.
- Use for streaming output such as tokens or log lines, with accumulate frames.
- Don't use for going to another page — use `<a href>` (a full page load, or a client navigation with `<ClientRouter />`).
- Don't use for state only the browser cares about (an open menu, a draft) — keep it in a client component.

## Step-by-step {#steps}

:::sequence
1. Create `transitions/search.ts`. The file path is the name: `transitions/search.ts` → `search`, `transitions/comments/add.ts` → `comments/add` (kebab-case segments).
2. Import `defineTransition` from `state-surface/server` and write `export default defineTransition({ targets, async *handler(params, ctx) { … } })`.
3. List in `targets` the slots this transition may change. Each slot's state is the props of the component inside that `<Slot>`.
4. Make the first `yield` a full frame: `{ type: 'state', states: { … } }` with the state of every target.
5. Yield partial frames (`full: false` with `changed` or `removed`) or accumulate frames for the next steps.
6. Return when you are done — there is no `done` frame. Throw `TransitionError` to show the user a message.
7. Run it from a page: `data-action="search"` on a button or form, `useAction(renew, 'search')` in a client component, or `<Boot transition="search" />` right after load.
:::

## Minimal example {#example}

```ts label="✓ StateSurface — 3-stage UX, order guaranteed by one stream"
// transitions/search.ts → "search": skeleton → cached → live
import { defineTransition } from 'state-surface/server';
import { searchCache, searchLive } from '../shared/search.server';

export default defineTransition({
  targets: ['search:summary', 'search:results'],
  async *handler(params, ctx) {
    const query = String(params.query ?? '');

    // 1. Full frame: the baseline of both targets — a loading skeleton
    yield {
      type: 'state',
      states: {
        'search:summary': { text: 'Searching…' },
        'search:results': { query, loading: true, items: [] },
      },
    };

    // 2. Partial frame: cached results first; the summary stays as it is
    const cached = await searchCache(query);
    yield {
      type: 'state',
      full: false,
      changed: ['search:results'],
      states: { 'search:results': { query, loading: false, items: cached, badge: 'cached' } },
    };

    // 3. Partial frame: live results replace them, and the summary changes too
    const live = await searchLive(query, ctx.signal);
    yield {
      type: 'state',
      full: false,
      changed: ['search:summary', 'search:results'],
      states: {
        'search:summary': { text: `${live.length} results` },
        'search:results': { query, loading: false, items: live, badge: 'live' },
      },
    };
    // No `done` frame: the engine sends it when the handler returns.
  },
});
```

```tsx label="routes/search.tsx — the slots it targets and the form that runs it"
import { Slot } from 'state-surface';
import Layout from '../layouts/Layout';
import SearchSummary from './search/_components/SearchSummary';
import SearchResults from './search/_components/SearchResults';

export default async function Page() {
  return (
    <Layout title="Search">
      {/* The form fields become the params: { query: '…' } */}
      <form data-action="search">
        <input name="query" />
        <button type="submit">Search</button>
      </form>
      <Slot name="search:summary" mode="server" component={SearchSummary} />
      <Slot name="search:results" mode="server" component={SearchResults} />
    </Layout>
  );
}
```

:::callout{kind="info"}
**Invisible Power** — what these lines get without extra code:

- ✓ Yield order is the UX timeline: skeleton → cached → live, guaranteed by one stream.
- ✓ No race between cached and live results — the server decides the order.
- ✓ A new search aborts the running one; the server stops its generator and aborts `ctx.signal`.
- ✓ Both slots carry `data-pending` while it runs, and `data-has-result` from its first applied result until it ends.
- ✓ Server slots render on the server, so the page ships no JavaScript for these components.
:::

```tsx label="Traditional approach — manual async coordination, 3 bugs" collapsible
// React-style search with a 3-stage UX
import { useState, useEffect, useRef } from 'react';

function SearchResults({ query }: { query: string }) {
  const [items, setItems] = useState([]);
  const [badge, setBadge] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    // ⚠️ BUG: if live resolves before cached, stale cached results overwrite live ones
    searchCache(query).then(cached => {
      if (controller.signal.aborted) return;
      setItems(cached);
      setBadge('cached');
      setLoading(false);
    });

    searchLive(query, controller.signal)
      .then(live => {
        if (controller.signal.aborted) return;
        setItems(live);
        setBadge('live');
      })
      .catch(e => {
        if (e.name === 'AbortError') return;
        // ⚠️ BUG: the error is swallowed — the user keeps seeing stale results
        console.error(e);
      });

    return () => controller.abort();
    // ⚠️ BUG: no guaranteed order — cached and live race each other
  }, [query]);

  if (loading) return <Skeleton />;
  return <ResultList items={items} badge={badge} />;
}
```

## Frame options {#frames}

Every frame a transition yields has `type: 'state'` and `states`, which maps slot names to the props of each slot's component. A few more fields decide how the frame is applied.

- **Full** (the default, `full` omitted) — the complete state of the transition's targets. A target missing from the frame is removed; slots outside the targets and static markup stay. The first frame of every request must be full.
- **Partial** (`full: false`) — updates the slots in `changed` and removes those in `removed`; the other targets stay. It needs at least one of `changed`, `removed` or `uiChanged`. `changed` keys must be in `states`, `removed` keys must not, and no key can be in both.
- **Accumulate** (`accumulate: true`) — merges a delta into each slot in `states`: arrays concat, strings concat, other values replace. Never the first frame, and never together with `removed`, `ui` or `reset`.
- **`ui` with `uiChanged`** — classes and CSS variables on the `<h-state>` element itself, without re-rendering its content.
- **`reset: ['slot']`** — remounts a client slot so its local state starts over, for example to clear a form after saving. Invalid on server slots.
- **One result** — a handler that is a plain `async` function (not a generator) returns `{ states }` once; the engine sends it as one full frame in a JSON response.

```ts label="Full → accumulate → partial in one transition"
// transitions/deploy.ts → "deploy"
import { defineTransition } from 'state-surface/server';
import { runBuild } from '../shared/deploy.server';

export default defineTransition({
  targets: ['deploy:status', 'deploy:log', 'deploy:hint'],
  async *handler(params, ctx) {
    // Full: the baseline of all three targets
    yield {
      type: 'state',
      states: {
        'deploy:status': { phase: 'building' },
        'deploy:log': { lines: [] },
        'deploy:hint': { text: 'This takes about a minute.' },
      },
    };

    // Accumulate: each line is appended (arrays concat)
    for await (const line of runBuild(String(params.branch), ctx.signal)) {
      yield { type: 'state', accumulate: true, states: { 'deploy:log': { lines: [line] } } };
    }

    // Partial: a new status, the hint removed, the log untouched
    yield {
      type: 'state',
      full: false,
      states: { 'deploy:status': { phase: 'done' } },
      changed: ['deploy:status'],
      removed: ['deploy:hint'],
    };
  },
});
```

You describe slot state; the engine decides what travels. A server slot (`mode="server"`) is rendered on the server and sent as HTML. A client slot (`client:*`) receives its new props, or only the delta as a `merge` op for accumulate frames. One frame becomes at most one patch, so slots that change together appear together — except a server slot rendered again within 33 ms of its previous render, which follows in the next patch.

:::callout{kind="note"}
Slot state lives for one request. Every request starts empty, and the server never trusts state sent by the browser — read what you need from your database again. The server stays stateless, so it behaves the same on one instance, many instances or Workers.
:::

:::callout{kind="tip"}
Rule of thumb: a full frame to set the baseline, partial frames for selective updates, accumulate frames for content that grows. The [Accumulate guide](/en/guide/accumulate) covers streaming in depth, and the [UI Patch guide](/en/guide/ui-patch) covers `ui`.
:::

## Options and concurrency {#options}

`defineTransition` takes the handler plus a few options, all optional. A bare handler works too: `export default defineTransition(search)`.

- `targets` — the slots this transition may change. A full frame replaces exactly these, and a frame that touches any other slot fails. In the browser they decide concurrency: a new action aborts running actions of the same name and those whose targets overlap; actions with disjoint targets run in parallel.
- Without `targets`, the slots of the first full frame become the targets on the server, but the browser cannot know them in advance: the action overlaps every slot, so it aborts — and is aborted by — every other action. Development warns once.
- `mode: 'queue'` — requests of this transition run one after another instead of aborting each other.
- `input` — a Standard Schema (zod, valibot, arktype, …) for the params. Invalid params never reach the handler: the response is 422 with `kind: 'validation'` and `fieldErrors`, shown in the error slot. Form bodies become objects first (a repeated name becomes an array), and the handler receives the parsed, typed value.
- `flash: { input: ['body'] }` — fields to echo back to forms without JavaScript. Any transition works as `<form method="post" action={actionUrl('comments/add')}>`: it runs the transition and redirects back with a 303, and the next page reads the result once with `await ctx.flash('comments/add')`. The listed fields come back in its `input` (never files), so the form can be refilled after an error. With JavaScript, the engine streams the same transition instead.
- `viewTransition: true` — wraps the action's first visible change in a View Transition.

```ts label="Typed input, declared targets, queued requests"
// transitions/like.ts → "like"
import { z } from 'zod';
import { defineTransition } from 'state-surface/server';
import { addLike, countLikes } from '../shared/likes.server';

export default defineTransition({
  // Invalid params → 422 { kind: 'validation', fieldErrors }; the handler never runs
  input: z.object({ postId: z.string(), delta: z.number().int().min(1).max(5) }),
  targets: ['post:likes'],
  mode: 'queue', // three quick clicks → three requests, one after another
  async *handler({ postId, delta }) {
    await addLike(postId, delta);
    yield { type: 'state', states: { 'post:likes': { count: await countLikes(postId) } } };
  },
});
```

:::callout{kind="tip"}
The build writes `.state-surface/actions.d.ts`, so `useAction(renew, 'like')` and `<Boot>` check transition names and params against `input`, and `actionUrl()` checks the name. The browser side — `data-action`, pending marks and results — is in the [Action guide](/en/guide/action).
:::

## Animation presets {#animation}

Add `data-animate` to a `<Slot>` — host attributes are written on its `<h-state>` element — to play a reveal animation each time a frame updates that slot. The value picks a preset; each preset also dims the slot while a request that targets it is pending.

- `fade` — opacity only; also what a bare `data-animate` does.
- `slide-up`, `slide-down`, `slide-left`, `slide-right` — a short move plus a fade; good for content that loads in steps.
- `scale` — a slight zoom plus a fade; draws attention to new content.
- `blur` — sharpens from a blur.
- `flip` — a quick 3D turn.

```tsx label="Using presets on slots"
{/* No animation: the slot updates silently */}
<Slot name="search:summary" mode="server" component={SearchSummary} />

{/* Fade in on every update */}
<Slot name="search:results" mode="server" component={SearchResults} data-animate="fade" />

{/* Slide up from below */}
<Slot name="demo:timeline" mode="server" data-animate="slide-up">
  <DemoTimeline frames={[]} />
</Slot>
```

```css label="Defining a custom preset"
@keyframes h-state-rotate {
  from { opacity: 0; transform: rotate(-5deg); }
  to   { opacity: 1; transform: rotate(0); }
}
h-state[data-animate="rotate"][data-just-updated] {
  animation: h-state-rotate 0.3s ease-out;
}
```

:::callout{kind="info"}
The animation is CSS only: the engine sets attributes, and the presets are plain CSS in the demo's `client/styles.css` (the `demo` template includes them; copy the `h-state[data-animate…]` rules into your own `client/styles.css` otherwise). The engine sets `data-just-updated` each time it applies new content to a slot (and removes it on `animationend`), and `data-pending` while a request that targets the slot runs. A custom preset only needs to target `h-state[data-animate="name"][data-just-updated]`. With `prefers-reduced-motion: reduce` the engine does not set `data-just-updated`, and the presets keep only the pending dimming, without movement.
:::

:::callout{kind="tip"}
To morph elements between two states, opt into the View Transition API instead: `viewTransition: true` on `defineTransition`, `data-view-transition` on the action element, or `<Slot viewTransition>`. There is one View Transition per action — on its first patch, or with `<Slot viewTransition>` on the first patch that changes that slot — and it is skipped for reduced motion or without the API.
:::

## Execution sequence {#sequence}

:::sequence
1. A `data-action` click or submit, `useAction().run()` or `<Boot>` POSTs to `/transition/search` with the params as JSON (or form data) and the `X-Surface-Build` and `X-Surface-Page` headers. Overlapping running actions are aborted, and the targets get `data-pending`.
2. The server checks the build (409 reloads the page) and validates `input` (422 stops here; the handler never runs).
3. The first frame is full and sets the baseline of every target (the declared `targets`, or else the slots of this frame). The request reducer applies it and projects each target: server slots render to `html` ops, client slots get `props` ops, all in one `patch` with `reset: true`.
4. Each later frame becomes one patch with ops for the slots it touches: `remove` ops for removed slots, `merge` ops for accumulate deltas on client slots, and server slot renders coalesced to at most one per 33 ms.
5. The browser reads the NDJSON lines as they arrive, coalesces queued ops once per animation frame and applies them per `<h-state>`. The targets get `data-has-result` once the first patch is applied.
6. The handler returns → the engine sends `done`, and `data-pending` and `data-has-result` are removed. The handler throws → an `error` frame renders the `system:error` slot.
:::

:::diagram{label="From yield to DOM"}
```text
data-action · useAction().run() · <Boot>
  │ POST /transition/search   X-Surface-Build · X-Surface-Page
  ▼
server ── input invalid? ──▶ 422 { kind: 'validation', fieldErrors }
  │ handler yields StateFrame
  ▼
request reducer ─▶ projection per slot mode
  │   server slot → { slot, html }
  │   client slot → { slot, props } or { slot, merge }
  ▼ NDJSON
{"type":"patch","reset":true,"ops":[…]} … {"type":"done"}
  ▼
browser: coalesce per animation frame → DOM per <h-state>
```
:::

## Common mistakes {#mistakes}

:::warning
Every request starts with a full frame. A partial or accumulate frame first is a protocol violation: the request ends with an error frame, whose message names the transition and the frame number in development (the server also logs the stack) and reads `Transition failed` in production.

There is no `done` or `error` frame to yield either. Return to finish, throw to fail.
:::

:::checklist
- The file is under `transitions/` and the action name is its path (`comments/add`), in kebab-case.
- The first yielded frame is full (no `full: false`, no `accumulate: true`).
- Partial frames have `full: false` and at least one of `changed`, `removed` or `uiChanged`.
- Keys in `changed` are in `states`, keys in `removed` are not, and no key is in both.
- Every slot a frame touches is in `targets`, is on the current page and is not static.
- No `yield { type: 'done' }` or `yield { type: 'error' }` — return to finish, throw to fail.
- Cookies are set before the first `yield`.
- Slow work receives `ctx.signal`, so an aborted request stops it.
:::

## Troubleshooting {#debug}

:::debug{symptom="The request fails at frame #1 with: the first state frame must be a full frame." cause="The first frame is partial (full: false) or accumulate."}
Remove `full: false` or `accumulate: true` from the first `yield` — full is the default. Only frames after the first may be partial or accumulate.
:::

:::debug{symptom="A frame fails with: slot … is outside the transition targets." cause="The slot is not in targets. Without targets, it was not in the first full frame."}
Add the slot to `targets`, or include it in the first full frame. A transition can only change the slots it declared.
:::

:::debug{symptom="A frame fails with: slot … is static and cannot be updated." cause="The Slot has neither a server mode nor a client directive, so it is rendered once."}
Add `mode="server"` (server-rendered HTML) or a `client:*` directive (props) to the `<Slot>`.
:::

:::debug{symptom="A slot disappears when a later frame arrives." cause="The later frame is full, and target slots missing from a full frame are removed."}
Use a partial frame (`full: false` with `changed`) to update some targets, or repeat every target in the full frame.
:::

:::debug{symptom="In production the error slot shows Transition failed instead of my message." cause="A plain Error was thrown. Outside development only TransitionError messages reach users."}
Throw `new TransitionError('…')` for messages users may see. Also make sure the layout renders `system:error` as a server or client slot (`<Slot name="system:error" mode="server" component={…} />`) — without it, or with a static one, nothing is shown, and development warns.
:::

:::debug{symptom="Clicking one button cancels an unrelated action." cause="One of the two transitions declares no targets, so it overlaps every slot."}
Declare `targets` on both. Actions with disjoint targets run in parallel; use `mode: 'queue'` when requests of the same transition must run in order.
:::

:::debug{symptom="A cookie set in the handler is never saved." cause="It was set after the first yield, when the response headers were already sent."}
Set cookies before the first frame. Development warns about later writes.
:::

## Next: try it live {#next}

Open the [Streaming Demo](/en/examples/streaming) to watch one transition send every kind of frame: a full frame fills the demo slots, a partial frame changes the timeline and the output, an accumulate frame appends to the timeline, another partial frame removes the output, and a final full frame brings it back. Its error button throws a `TransitionError`. Then read the [Accumulate guide](/en/guide/accumulate) to stream tokens into a client slot.
