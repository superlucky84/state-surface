---
title: Action
order: 5
demoHref: /examples/actions
demoLabel: Actions Playground
---

## TL;DR {#tldr}

An action connects a user event to a server [transition](/en/guide/transition). Put `data-action="cart/update"` on a button or a form and the engine does the rest: it reads the params when the event happens, posts them, marks the affected slots as pending, cancels requests that would conflict and applies the streamed result. There are three ways in, all running on the same action runtime:

- `data-action` + `data-params` on buttons, links and forms — no event handlers to write.
- `<form method="post" action={actionUrl('comments/add')}>` — works without JavaScript (post, redirect, one-time flash) and streams when JavaScript runs.
- `useAction(renew, 'like')` in a client component — typed params plus `pending`, `error` and a result promise.

## Mental model {#analogy}

:::analogy
An action is a hotel TV remote. Each button carries a channel name (`data-action`); the TV (the engine) does the actual work of switching channels (transitions). You never wire up the signal yourself — you only label the buttons. Press a new channel while the last one is still tuning and the TV drops the old one; the volume button controls something else (other targets), so it keeps working at the same time.
:::

Compare the wiring. In a React app a button calls a handler → `fetch` → `setState` → re-render, and loading, errors and races are yours to handle. In StateSurface the button has `data-action="name"` → the engine posts → the server yields frames → the slots update. The wiring is built in; you only name the transition.

:::callout{kind="tip"}
Coming from React? Think of `data-action` as a pre-wired `onClick` / `onSubmit` that sends the params to the server and streams the answer back into the page — no `useState`, no `fetch`, no `AbortController`. When a component does need the request state (a disabled button, inline field errors), `useAction` is the hook-shaped version of the same runtime.
:::

## When to use {#when}

- Use `data-action` for clicks and submits that load or change server state: search, filters, add to cart, like, delete.
- Use `<form method="post" action={actionUrl('name')}>` when the form must work before or without JavaScript: comments, sign-up, settings.
- Use `useAction(renew, 'name')` in a client component that needs `pending`, `error` or the result — a disabled button, inline field errors, a toast.
- Use `data-pending-targets` to keep the loading mark on the slots the user is actually waiting for.
- Don't use actions for page navigation — use `<a href>` (with `<ClientRouter />` in the layout, links become client navigations).
- Don't call `fetch('/transition/…')` yourself — the runtime adds the build and page headers, concurrency, pending marks and error handling.

## Step-by-step {#steps}

:::sequence
1. Create the transition. Its path under `transitions/` is the action name: `transitions/cart/update.ts` → `cart/update`. Declare the `targets` it changes.
2. Add `data-action="cart/update"` to a `<button>` or a `<form>` — in a slot template or anywhere in the page markup.
3. Add fixed params as a JSON object in `data-params` (optional). A form adds its named fields and the submit button that was clicked; fields win over `data-params` keys with the same name.
4. Scope the loading mark with `data-pending-targets="cart:summary"` (optional; default: the transition's targets, else every slot) and style it in CSS, for example `h-state[data-pending] { opacity: 0.5 }`.
5. Validate with an `input` Standard Schema (optional). Invalid params never reach the handler; the action ends with a `validation` error carrying `fieldErrors`.
6. Write no JavaScript: the engine listens for `click` and `submit` on `document`. Reach for `useAction` only inside a client component that needs the request state.
:::

## Minimal example {#example}

```tsx label="✓ StateSurface — 14 lines of markup, zero event handlers"
// routes/cart/_components/shippingForm.tsx
export default function ShippingForm() {
  return (
    <form data-action="cart/update" data-pending-targets="cart:summary">
      <select name="shipping">
        <option value="standard">Standard — $5.00</option>
        <option value="express">Express — $15.00</option>
        <option value="overnight">Overnight — $30.00</option>
      </select>
      <button type="submit" name="intent" value="save">Save</button>
      <button type="submit" name="intent" value="order">Place order</button>
    </form>
  );
}
```

```ts label="transitions/cart/update.ts — the file path is the action name"
// transitions/cart/update.ts → data-action="cart/update"
import { defineTransition } from 'state-surface/server';
import { saveShipping } from '../../shared/cart.server';

export default defineTransition({
  // Slots this action changes: actions on other slots keep running in parallel
  targets: ['cart:summary'],
  async *handler(params, ctx) {
    // params = { shipping: 'express', intent: 'order' } — the fields and the clicked button
    const cart = await saveShipping(ctx, String(params.shipping), params.intent === 'order');
    // The page renders <Slot name="cart:summary" mode="server"><CartSummary … /></Slot>
    yield { type: 'state', states: { 'cart:summary': cart } };
  },
});
```

:::callout{kind="info"}
**Invisible Power** — what `data-action` handles for this form:

- No `onSubmit` or `onChange` — the fields and the clicked button are read when the form is submitted
- No `fetch` — the engine posts to `/transition/cart/update` with the build and page headers
- No loading state — `cart:summary` carries `data-pending` until the request ends
- No race conditions — a second submit aborts the first one; actions on other slots keep running
- No error plumbing — a thrown `TransitionError` appears in the page's `system:error` slot
- No client component — the summary is server HTML, so no component JavaScript ships for it
:::

```tsx label="Traditional approach — 49 lines, manual form state, fetch and abort" collapsible
// React-style shipping form — manual state, fetch and abort
import { useRef, useState } from 'react';

function ShippingForm() {
  const [shipping, setShipping] = useState('standard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Which button was clicked? Dig it out of the native event
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipping, intent: submitter?.value }),
        signal: controller.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // ⚠️ The summary lives in another component: lift state up or add a store
      updateCartSummary(await res.json());
    } catch (err) {
      // ⚠️ An aborted request must not show an error
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      // ⚠️ BUG: the aborted request clears the newer request's loading state
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <select value={shipping} onChange={e => setShipping(e.target.value)}>
        <option value="standard">Standard — $5.00</option>
        <option value="express">Express — $15.00</option>
        <option value="overnight">Overnight — $30.00</option>
      </select>
      <button type="submit" value="save" disabled={loading}>Save</button>
      <button type="submit" value="order" disabled={loading}>Place order</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

Inside a client component, `useAction` runs the same runtime and re-renders the component with the request state. The name and the params are typed from `.state-surface/actions.d.ts`, which the build writes from `transitions/**`.

```tsx label="useAction — a client island with typed params"
// routes/posts/_components/likeButton.tsx — rendered as <LikeButton client:load />
import { mount } from 'lithent';
import { useAction } from 'state-surface/client';

const LikeButton = mount(renew => {
  const like = useAction(renew, 'like'); // run({ delta }) is checked against transitions/like.ts
  const onClick = async () => {
    const result = await like.run({ delta: 1 }); // never throws
    if (!result.ok && !result.aborted) console.warn(result.error.kind, result.error.fieldErrors);
  };
  return () => (
    <button type="button" disabled={like.pending} onClick={onClick}>
      {like.pending ? 'Saving…' : like.error ? `Failed: ${like.error.kind}` : 'Like'}
    </button>
  );
});

export default LikeButton;
```

A form that must work before JavaScript loads — or without it — posts to `actionUrl(name)`. Without JavaScript the server runs the transition to the end, answers `303` and leaves the result in a one-time flash cookie. With JavaScript the engine intercepts the submit and streams the same transition instead.

```tsx label="JS-less form — one transition, two paths"
// transitions/comments/add.ts
import { z } from 'zod';
import { defineTransition } from 'state-surface/server';

export default defineTransition({
  input: z.object({ postId: z.string(), body: z.string().min(1) }), // any Standard Schema
  targets: ['comments:list'],
  flash: { input: ['body'] }, // echo these fields back after a JS-less submission (success or error)
  async *handler({ postId, body }, ctx) {
    await db.addComment(postId, body);
    yield { type: 'state', states: { 'comments:list': { postId } } };
  },
});

// routes/posts/[id].tsx — the page reads the result once, after the redirect
const flash = await ctx.flash('comments/add'); // { ok, error?, input? } or undefined
const form = (
  <form method="post" action={actionUrl('comments/add')}>
    <input type="hidden" name="postId" value={ctx.params.id} />
    <textarea name="body">{flash && !flash.ok ? String(flash.input?.body ?? '') : ''}</textarea>
    {flash?.error && <p role="alert">{flash.error.message}</p>}
    <button type="submit">Post</button>
  </form>
);
```

## Execution sequence {#sequence}

:::sequence
1. The user clicks inside a `[data-action]` element or submits a form with `data-action` (or one that posts to `actionUrl()`). The engine listens on `document` in the bubble phase: if a component already called `preventDefault()`, the engine leaves the event alone; otherwise it calls `preventDefault()` itself, and one event runs one action.
2. The engine snapshots the invocation at event time: `data-action`, `data-params`, the form fields with the submitter's name and value (a repeated name becomes an array; a chosen file turns the body into multipart) and `data-pending-targets`.
3. Concurrency: running requests with the same name, or with targets that overlap this one's, are aborted. With `mode: 'queue'` the request waits for the earlier one of the same name instead.
4. The pending anchors get `data-pending`: the `data-pending-targets` list, else the transition's targets, else every slot.
5. `POST /transition/cart/update` goes out with `X-Surface-Build` and `X-Surface-Page`. With an `input` schema the server validates first: invalid params end with a 422 `validation` error and the handler does not run.
6. The handler yields frames; the server reduces them and sends per-slot ops — HTML for server slots, props or merges for client slots. The browser applies them once per animation frame; after the first result the anchors also get `data-has-result`.
7. The handler returns and the engine sends `done`: the marks are removed and `run()` resolves `{ ok: true }`. A throw becomes an `error` frame shown in `system:error` and resolves `{ ok: false, error }`; an abort resolves `{ ok: false, aborted: true }`.
:::

:::callout{kind="info"}
Concurrency is decided by the `targets` you declare in `defineTransition`:

- Same name again → the earlier request is aborted (submitting a search repeatedly is safe — only the latest result lands).
- Overlapping targets → the earlier request is aborted; disjoint targets → both run (a like while a slow search loads).
- No `targets` → the action overlaps every slot: it aborts everything and anything aborts it (development warns once).
- `mode: 'queue'` → requests of that name run one after another (every click on a like button counts).
:::

## Common mistakes {#mistakes}

:::warning
`data-params` must be a JSON **object** with double-quoted keys and strings. `data-params="{query: 'foo'}"` does not parse: the action still runs without the `data-params` values (a button sends `{}`, a form only its fields) (in debug mode, `?debug=1`, the console shows the parse error). Write `data-params='{"query":"foo"}'`, or `data-params={JSON.stringify({ query })}` for values computed in the template.
:::

:::checklist
- The name is the file path under `transitions/` without the extension, in kebab-case: `transitions/cart/update.ts` → `data-action="cart/update"`.
- Every control that should be sent has a `name`, and `data-action` sits on the `<form>`, not on its submit button.
- Form fields override `data-params` keys with the same name — keep fixed values and field names apart.
- A checkbox group sends a string when one box is checked and an array when several are — accept both in the handler or the schema.
- Transitions that should run side by side declare disjoint `targets`; leave `targets` out only for actions that may cancel everything.
- `data-pending-targets` lists slot names separated by commas, for example `data-pending-targets="cart:summary,cart:badge"`.
- `useAction` does not abort when its component unmounts — call `abort()` when the request should stop with the component.
- Don't prerender a page that shows a JS-less form's result: prerendered pages cannot read `ctx.flash()`.
:::

## Debugging checklist {#debug}

:::debug{symptom="A click does nothing — no request appears in the Network tab." cause="The attribute is misspelled (data-transition, action), a component handler called preventDefault() on the event, or the element sits in a shadow root that the document listener cannot see into. Or the element was rendered only in the browser (for example by a client:only island) on a page without a server-rendered action: the engine then never starts — use useAction in that component."}
Inspect the element: `data-action` must be on it or on an ancestor. A handler that calls `preventDefault()` keeps the event on purpose — create a `useAction(renew, 'name')` handle in that component and call its `run()` from the handler instead.
:::

:::debug{symptom="The request answers 404." cause="No transition is registered under that name."}
The name is the path under `transitions/` (`transitions/comments/add.ts` → `comments/add`); files and folders starting with `_` are helpers, not transitions. `.state-surface/actions.d.ts` lists every registered name. `useAction`, `<Boot>` and `actionUrl()` are type-checked against it — `data-action` strings are not.
:::

:::debug{symptom="The handler receives empty params or misses form fields." cause="data-params is not valid JSON, the controls have no name, or data-action is on the submit button instead of the form."}
Open the page with `?debug=1` and look for a `data-params` parse error in the console, add `name` to every control and move `data-action` to the `<form>` — on a button it sends only that button's `data-params`.
:::

:::debug{symptom="A running action is cancelled when another one starts." cause="One of the transitions declares no targets, or their targets overlap."}
Declare `targets` on both transitions with disjoint slots to run them in parallel, or set `mode: 'queue'` when repeated runs of one name must all complete.
:::

:::debug{symptom="run() resolves with error.kind validation." cause="The input schema rejected the params, so the handler did not run."}
Show `error.fieldErrors` (field path → messages) next to the fields. Form values arrive as strings, so coerce numbers in the schema, for example `z.coerce.number()`.
:::

:::debug{symptom="The JS-less form redirects back but shows no result." cause="The page does not read the flash under the same name, the flash was already read, or the page is prerendered."}
Read `await ctx.flash('comments/add')` in the page function or in a server component's `load`, with exactly the transition name. The flash can be read once, within 60 seconds; prerendered pages cannot read it.
:::

## Next: try it live {#next}

Open the [Actions Playground](/en/examples/actions): button and form actions, a scoped pending mark, a `useAction` like button that runs in parallel with a slow playground action and queues rapid clicks, and a comment form that also works with JavaScript turned off.

- [Transition guide](/en/guide/transition) — targets, frames and errors on the server side.
- [UI Patch guide](/en/guide/ui-patch) — change a slot's classes and CSS variables from the same action.
- [Accumulate guide](/en/guide/accumulate) — stream text into a client slot while the action runs.
