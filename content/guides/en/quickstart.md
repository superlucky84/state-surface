---
title: 10-Minute Quickstart
order: 1
demoHref: /examples/search
demoLabel: Search Demo
---

## What you will build {#preview}

Type a book title and press Search. A loading skeleton appears instantly, then the results arrive from the server — the page never reloads. To build this you write 4 short files. None of them contains a fetch call, DOM code, client-side state or abort handling: the engine does all of that.

:::diagram{label="What happens when you search"}

```text
Type "design" → press Search
    ↓
[ Instantly ]   the results slot shows a skeleton, the server starts working
    ↓  600 ms…
[ Next frame ]  the matching books replace the skeleton
    ↓
[ Search again ]  the running request is aborted → no stale results
```

:::

:::callout{kind="info"}
The 4 files: a page (Surface) with one `<Slot>`, two components (the search form and the results Template) and one Transition in `transitions/`. Every feature follows this pattern — only the slots, the components and the server logic change.
:::

## Before you start {#prereqs}

- Node.js 20.19+ or 22.12+ and pnpm (`node --version`, `pnpm --version`).
- Basic TypeScript and JSX help, but are not required.
- If you have used React or Vue, the components will look familiar right away.

```bash label="Create and start a new app"
npx create-state-surface my-app
cd my-app
pnpm install
pnpm dev
```

:::callout{kind="tip"}
Keep `pnpm dev` running in one terminal. New files in `routes/` and `transitions/` are picked up when you save, and the browser reloads. The app runs at `http://localhost:3000`; you will add one page, `/books`, next to the generated ones.
:::

## File 1 — Create the page (Surface) {#step1}

:::analogy
The page is the floor plan of a building, drawn on the server for every request. A `<Slot>` is a socket set into the wall: its position is fixed, and only the appliance plugged into it changes. Everything outside the slots is wall — it does not change during the visit.
:::

```tsx label="routes/books.tsx ← new file"
import { Slot } from 'state-surface';
import BookSearch from './books/_components/bookSearch.js';
import BookResults from './books/_components/bookResults.js';

export default async function Page() {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Book Search</title>
      </head>
      <body class="min-h-screen bg-slate-100 text-slate-900">
        <main class="mx-auto max-w-xl space-y-6 p-8">
          <h1 class="text-2xl font-bold">Book Search</h1>
          <BookSearch />
          <Slot name="books:results" mode="server">
            <BookResults query="" />
          </Slot>
        </main>
      </body>
    </html>
  );
}
```

- `routes/books.tsx` serves `GET /books`. A page is an async function that returns the whole document; it receives `ctx` (`SurfaceContext`: URL, params, cookies), which this page does not need.
- `<Slot name="books:results">` renders an `<h-state name="books:results">` anchor — the only part of this page a transition may change.
- `mode="server"` means transitions update the slot with HTML rendered on the server. A slot without `mode` or a `client:*` directive is static: frames cannot change it.
- The slot's single child is its initial state: the child's props **are** the slot state. Here `query=""` renders the empty hint.

:::callout{kind="info"}
Only `<Slot>` is StateSurface-specific; the rest is plain JSX you control. The engine adds the doctype, `client/styles.css`, the `__SURFACE__` bootstrap JSON and the engine script — those two only because the page uses `data-action`. In a real app the `<html>` shell moves into `layouts/Layout.tsx`.
:::

:::callout{kind="tip"}
The two imports point at the files from step 2. Until they exist the dev server shows an import error — that is expected.
:::

## Files 2 & 3 — Create the components (Template) {#step2}

:::analogy
A Template is a React component whose props are decided by the server. It never fetches or stores data: the server renders it with the state of its slot and sends the HTML.
:::

```tsx label="routes/books/_components/bookSearch.tsx ← search form"
const BookSearch = () => (
  <form data-action="book-search" class="flex gap-2">
    <input
      name="query"
      placeholder="Search books..."
      class="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm"
    />
    <button type="submit" class="rounded-lg bg-slate-900 px-5 py-2 text-sm text-white">
      Search
    </button>
  </form>
);

export default BookSearch;
```

```tsx label="routes/books/_components/bookResults.tsx ← results Template"
type Book = { title: string; author: string };
type Props = { query: string; loading?: boolean; books?: Book[] };

const BookResults = ({ query, loading, books }: Props) => {
  if (loading)
    return (
      <div class="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} class="h-6 animate-pulse rounded bg-slate-200" />
        ))}
      </div>
    );
  if (!books) return <p class="text-sm text-slate-400">Type a title and press Search.</p>;
  if (!books.length) return <p class="text-sm text-slate-500">No books match "{query}".</p>;
  return (
    <ul class="space-y-2">
      {books.map(book => (
        <li key={book.title} class="text-sm">
          <span class="font-medium">{book.title}</span>
          <span class="text-slate-400"> — {book.author}</span>
        </li>
      ))}
    </ul>
  );
};

export default BookResults;
```

- `BookSearch` is ordinary page markup outside any slot, rendered once. `data-action="book-search"` is the whole wiring: on submit the engine sends the form fields (`{ query: "design" }`) to the `book-search` transition.
- `BookResults` is the Template of `books:results`: one function from props to JSX. Every frame for this slot is exactly this props object.
- No `useState`, no `useEffect`, no `fetch`. Components render synchronously; data is awaited in the page or the transition.

:::callout{kind="tip"}
Files and folders that start with `_` are not pages, so `routes/books/_components/` keeps the components next to the page without creating new URLs.
:::

## File 4 — Create the Transition {#step3}

:::analogy
A Transition is the subtitle track of the page. The video — the HTML page — keeps playing; each `yield` sends the next subtitle line (one NDJSON line), and the screen updates line by line.
:::

```ts label="transitions/book-search.ts ← server logic"
import { defineTransition } from 'state-surface/server';

const BOOKS = [
  { title: 'Design Patterns', author: 'Gang of Four' },
  { title: 'Clean Code', author: 'Robert C. Martin' },
  { title: 'Refactoring', author: 'Martin Fowler' },
];

export default defineTransition({
  targets: ['books:results'],
  async *handler(params) {
    const query = String(params.query ?? '').trim();

    // Frame 1 (full): sets every target slot, the skeleton shows at once
    yield { type: 'state', states: { 'books:results': { query, loading: true } } };

    // Stand-in for a database query or an API call
    await new Promise(resolve => setTimeout(resolve, 600));
    const books = BOOKS.filter(book => book.title.toLowerCase().includes(query.toLowerCase()));

    // Frame 2 (partial): changes only the slots listed in `changed`
    yield {
      type: 'state',
      full: false,
      changed: ['books:results'],
      states: { 'books:results': { query, books } },
    };
    // No `done` frame: the engine sends it when the handler returns
  },
});
```

- The file path is the name: `transitions/book-search.ts` answers `POST /transition/book-search`, the name used by `data-action`.
- `targets` lists the slots this transition may change. While it runs the browser marks them `data-pending`, and a new search aborts the running one because their targets overlap.
- The first frame must be full: it replaces every target slot. Later frames can be partial (`full: false` with `changed`) and touch only the listed slots.
- A slot's state is the complete props object of its component. A partial frame replaces `books:results` as a whole, which is why frame 2 repeats `query`.

:::callout{kind="tip"}
Never yield `{ type: 'done' }` or an error frame. Return to finish; throw to fail. A `TransitionError` (from `state-surface/server`) message is shown in the page's `system:error` slot, which the scaffold's `layouts/Layout.tsx` renders. This standalone `/books` page has none yet: until it uses the layout, the message only appears in the Network response (and as a development warning in the console).
:::

:::callout{kind="info"}
The params arrive untyped here (`Record<string, unknown>`). Add `input` with any Standard Schema (zod, valibot, arktype…) to validate them: invalid params get a 422 with field errors and the handler never runs. See the [Transition guide](/en/guide/transition).
:::

## The whole pipeline at a glance {#flow}

:::diagram{label="Form submit → DOM update"}

```text
[ Form submit ]
    │  data-action="book-search", fields → { query: "design" }
    ▼
[ Browser: action runtime ]
    │  abort a running book-search (same targets)
    │  mark <h-state name="books:results"> with data-pending
    │  POST /transition/book-search
    ▼
[ Server: handler runs ]
    │  yield frame 1 (full)     → render <BookResults loading />  → patch line (reset)
    │  … 600 ms "database" …
    │  yield frame 2 (partial)  → render <BookResults books />    → patch line
    │  handler returns          → done line
    ▼
[ Browser: apply ops ]
    │  swap the HTML inside <h-state name="books:results">
    │  first patch applied → data-has-result set
    ▼
[ Finished: data-pending and data-has-result removed ]
```

:::

That pipeline is all of StateSurface. The page fixes the slots, Templates turn slot state into HTML on the server, the Transition streams state frames, and an Action (`data-action`) connects a user event to a Transition. You wrote no server communication, no DOM updates and no abort logic — the engine handles all of it.

## Verify it works {#verify}

:::sequence
1. Make sure `pnpm dev` is running.
2. Open `http://localhost:3000/books`. The form and the hint “Type a title and press Search.” are already in the server HTML.
3. Type `design` and press Search.
4. A skeleton shows for about 600 ms, then “Design Patterns — Gang of Four” appears — success.
5. Press Search twice quickly: the first request is aborted and only the latest result is shown.
:::

:::callout{kind="note"}
Open DevTools → Network and click the `book-search` request. The response is NDJSON: two `patch` lines whose ops carry the HTML rendered for `books:results`, then `{"type":"done"}`. While it runs, `<h-state name="books:results">` carries `data-pending`.
:::

:::debug{symptom="Pressing Search changes nothing" cause="The data-action name does not match a file in transitions/"}
The file path is the name: `data-action="book-search"` runs `transitions/book-search.ts`. A wrong name answers 404 `Transition "…" not found` in the Network tab.
:::

:::debug{symptom="The response ends with an error frame instead of done" cause="The Slot has no mode, so it is static"}
Frames cannot change a static slot; the error message says `slot "books:results" is static and cannot be updated`. Add `mode="server"` to `<Slot name="books:results">`.
:::

:::debug{symptom="The page shows an import error" cause="A component file from step 2 is missing or misnamed"}
The page imports `./books/_components/bookSearch.js` and `./books/_components/bookResults.js`; the `.js` extension resolves to the `.tsx` file next to it.
:::

## Next steps {#next}

Quickstart complete. Read the concept guides in order to understand each piece in depth.

- [Surface guide](/en/guide/surface) — slot modes (static, server, client), layouts and `<Boot>`.
- [Template guide](/en/guide/template) — props as slot state, server components and client islands.
- [Transition guide](/en/guide/transition) — full, partial and removed frames, `targets` and `input` schemas.
- [Action guide](/en/guide/action) — `data-params`, forms, `data-pending-targets` and `useAction`.
- [Search demo](/en/examples/search) — this pattern with a `swap="morph"` input slot.
- [Streaming demo](/en/examples/streaming) — watch a frame sequence step by step.
