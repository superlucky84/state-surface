# StateSurface Protocol (v2: two layers)

This file is the implementation-facing contract for transitions. It follows
[docs/surface-expansion/DESIGN.md](docs/surface-expansion/DESIGN.md) 6장 (DC-09, DC-10, DC-13, DC-14),
which supersedes the single-layer frame contract of `docs/ui-protocol/DESIGN.md`.

There are two layers:

1. **Authoring layer** — what a transition yields or returns. Logical state frames
   (full · partial · accumulate · removed · ui). Public API.
2. **Transport layer** — what the server sends to the browser. Per-slot op lists. Engine
   internal; the browser executes ops in order and does not interpret merge rules.

```text
transition yields StateFrame ─▶ server: validate → request reducer → project per slot mode
                                 (server slot: render HTML, client slot: props / merge)
                              ─▶ { type: 'patch', reset?, ops: [...] } … { type: 'done' }
```

## Requests

- Endpoint: `POST {BASE_PATH}/transition/:name`, body = JSON object of params (100 KiB default
  limit, 413 above; malformed or non-object JSON is 400).
- Required headers (sent by the engine runtime):
  - `X-Surface-Build: <buildId>` — must equal the server's build id, else **409** (the browser
    reopens the current URL as a document load).
  - `X-Surface-Page: <pageId>` — the page manifest used to resolve slots (route file path without
    extension, e.g. `guide/[slug]`); missing or unknown is **400**. It is not an authorization input.
- POST validates `Origin` (or `Sec-Fetch-Site` when `Origin` is absent); an allowed-origin list is
  configurable. Unknown request headers are accepted.
- Response: `application/x-ndjson` when the handler is an async generator (one JSON frame per line,
  empty lines ignored), `application/json` `{ "frames": [...] }` when it is an async function.
- Cookies set before the first frame are committed with the response headers; later writes are
  ignored (development warns).
- `X-Surface-View-Transition: 1` marks a transition declared with `viewTransition: true`.

## Authoring Layer

```ts
type StateFrame = {
  type: 'state';
  states: Record<string, any>;
  ui?: Record<string, UiPatch | null>;
  full?: boolean; // default true
  accumulate?: boolean; // default false
  changed?: string[];
  removed?: string[];
  uiChanged?: string[];
};

// async function transitions return one result, normalized to a full frame
type TransitionResult = {
  states?: Record<string, any>;
  ui?: Record<string, UiPatch | null>;
} | void;
```

Rules (violations: development throws with the transition name and frame number, production
sends an `error` frame and ends the request):

- The first state frame is **full**. Partial or accumulate first is invalid.
- There is **no `done`** in the authoring layer: when the handler returns, the engine sends it.
  Yielding `{ type: 'done' }` is invalid. Yielding `{ type: 'error' }` is invalid: **throw**.
  Throw `TransitionError` (from `state-surface/server`) for a message the user may see in
  production; other errors become `Transition failed` outside development.
- **Targets**: `defineTransition(name, { targets, handler })` declares the slots the transition may
  change. Without it, the slots of the first full frame become the targets. Any frame that touches
  a slot outside the targets, a slot that is not on the page, or a static slot is invalid.
- `full` (default) replaces the **targets** — not the whole page. Target slots missing from a full
  frame are removed; slots outside the targets and static content stay.
- Partial (`full: false`) needs at least one of `changed`, `removed`, `uiChanged`. `changed` keys
  must exist in `states`, `removed` keys must not, and a key cannot be in both.
- Accumulate (`accumulate: true`) merges deltas: arrays concat, strings concat, other values
  replace (shallow). It cannot carry `removed` or `ui` and is never the first frame.
- UI patches: `classAdd`/`classRemove` are arrays of tokens matching `[A-Za-z0-9_:/\[\].-]+`;
  `cssVars` keys start with `--` and values must not contain `;`, `{`, `}`, `\`, `url(` or
  `expression(`. A full frame sets the UI of every target slot (missing → cleared).
- An empty handler (no frame) is a successful request: the engine sends only `done`.

The slot state exists for **one request**. Every request starts empty; read what you need from a
server source again (DC-10). The server never trusts client snapshots.

### Valid examples

```json
{ "type": "state", "states": { "search:results": { "loading": true, "query": "q" } } }
{ "type": "state", "full": false, "states": { "search:results": { "items": [] } }, "changed": ["search:results"] }
{ "type": "state", "full": false, "states": {}, "removed": ["chat:typing"] }
{ "type": "state", "accumulate": true, "states": { "chat:current": { "text": " world" } } }
{ "type": "state", "full": false, "states": {}, "ui": { "card": { "classAdd": ["is-new"] } }, "uiChanged": ["card"] }
```

### Invalid examples

```json
{ "type": "state", "full": false, "states": { "a": {} } }
{ "type": "state", "full": false, "states": {}, "changed": ["a"] }
{ "type": "state", "full": false, "states": { "a": {} }, "removed": ["a"] }
{ "type": "state", "accumulate": true, "states": { "a": { "t": "x" } }, "removed": ["b"] }
{ "type": "state", "states": { "a": {} }, "ui": { "a": { "classAdd": "not-an-array" } } }
{ "type": "done" }
```

An accumulate or partial frame as the first frame is invalid as well.

### External frames

Frames from an outside source (an agent, a queue) enter only through the transition:
`yield* ctx.external(source)`. Each frame may only touch slots declared with `external` and a
Standard Schema `schema` (`<Slot external schema={s}>`); the values are validated by the schema.
A violating external frame is dropped and logged; the transition continues. There is no public
endpoint for frames.

## Transport Layer

```ts
type WireFrame =
  | { type: 'patch'; reset?: true; ops: Op[] }
  | { type: 'done' }
  | {
      type: 'error';
      message: string;
      slot?: string;
      html?: string;
      islands?: IslandMeta[];
      props?: object;
    };

type Op =
  | { slot: string; html: string; islands?: IslandMeta[] } // server slot
  | { slot: string; props: object } // client slot: replace props
  | { slot: string; merge: object } // client slot: accumulate delta
  | { slot: string; remove: true } // any slot: cleanup and clear
  | { slot: string; ui: UiPatch | null }; // any slot: the slot's whole UI patch

type IslandMeta = {
  id: string;
  component: string;
  props: object;
  activation?: 'idle' | 'visible' | 'media';
  media?: string;
  only?: true;
};
```

```json
{"type":"patch","reset":true,"ops":[{"slot":"article:body","html":"<article>…</article>"},{"slot":"chat:current","props":{"text":""}},{"slot":"article:body","ui":null}]}
{"type":"patch","ops":[{"slot":"chat:current","merge":{"text":"Hel"}}]}
{"type":"done"}
```

Server projection:

- One authoring frame becomes at most one patch (`reset: true` for a full frame); a frame that
  changes server and client slots produces one patch with both kinds of ops.
- Within a patch: `remove` ops, then content ops, then `ui` ops.
- Server slots re-run `load` and render on every update, coalesced per slot: the first update
  renders immediately, later ones at most once per 33 ms, and pending renders are flushed before
  `done`/`error`. Client ops are not coalesced on the server.
- `html` contains only the output of the slot's registered component, rendered with the slot's
  capability (below). Islands inside it are listed in `islands`.

Browser state table (per request):

| State                        | Accepts                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| awaiting-baseline            | `reset` patch → active · `done` → completed (empty success) · `error` → failed · other patch → protocol error |
| active                       | patch → active · `done` → completed · `error` → failed                                                        |
| completed / failed / aborted | nothing (later frames are ignored)                                                                            |

- EOF without `done` or `error` is an error; applied ops are not rolled back.
- The browser re-checks op structure only. A malformed content op, an unknown op (version
  mismatch) or an op whose kind does not match the slot mode stops the request; an invalid `ui`
  op is skipped and traced.
- Queued ops are coalesced once per animation frame: per slot the last `html`/`props` wins,
  `merge` folds into the preceding `props`/`merge`, ops after `remove` are a new appearance.
- Abort previous: a new transition invalidates the queue and DOM work of the previous one.
- `error`: when `slot` names a slot on the page, its `html` (server slot) or `props` (client slot)
  is shown there regardless of targets; it is cleared by the next request's baseline. Without an
  error slot nothing is shown; development warns. Both cases call `reportError`.

Receive limits (browser and server, configurable with `createHandler({ limits })`): one NDJSON
line 1 MB, one response 32 MB, 10,000 ops per request, one `html` op 512 KB, 30 s idle between
frames and 5 minutes per request. Development warns at 80%.

## Server HTML Application

- `swap="replace"` (default): plugin cleanup → dispose islands in the slot → `innerHTML` →
  restore focus, selection and scroll by element `id` → plugin `attach` → activate `islands`.
- `swap="morph"`: idiomorph 0.7.4 (own chunk, loaded only on pages with a morph slot) patches the
  DOM; an island with the same component and props keeps its instance, a changed one is disposed
  and activated again (IC-06); plugins get `update`.
- Scripts inside applied HTML never run; development warns.

## Capability

| Capability       | Slot content                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| strict (default) | Component props only. No raw HTML (`innerHTML` is an error). URL attributes (`href`, `src`, `action`, `formaction`, …) outside http, https, mailto and relative references are dropped. |
| rich             | strict plus Markdown through `Markdown` from `state-surface/rich` (mdast → hast allowlist, raw HTML dropped).                                                                           |
| unsafe           | Raw HTML allowed; `<script>` is made inert. `sandbox="iframe"` renders the content into a sandboxed iframe `srcdoc`.                                                                    |

Capability is fixed by the page manifest; a frame cannot raise it.

## Bootstrap

One JSON script per page (written only when the page needs the engine or has an app entry):

```html
<script id="__SURFACE__" type="application/json">
  {
    "buildId": "…",
    "pageId": "examples/search",
    "basePath": "",
    "slots": [
      { "id": "search:input", "mode": "server", "swap": "morph" },
      { "id": "chat:current", "mode": "client", "component": "routes/…/chatCurrent.tsx#default" },
      {
        "id": "$0",
        "mode": "client",
        "component": "…#default",
        "props": {},
        "activation": "visible"
      }
    ],
    "boot": [{ "transition": "guide-load", "params": { "slug": "quickstart" } }],
    "plugins": [{ "id": "client/plugins/prism.ts#prism", "load": "load" }]
  }
</script>
```

- `<`, `>`, `&`, U+2028 and U+2029 are written as `\u` escapes.
- Server slots carry no props; client slots and islands carry their SSR snapshot props.
- Island ids: `$N` at page level, `<slot>$N` inside a slot. Hosts are `<h-island data-island="id">`.
- `defer` holds the sealed token of a deferred server slot (below).

## Deferred Server Slots

`<Slot name="cart" mode="server" server:defer fallback={…} cache="public, max-age=60">` renders the
fallback during SSR and a token: the slot props, componentId, slot name, buildId and capability,
encrypted with AES-GCM using a key derived (HKDF-SHA256, `state-surface/defer/v1`) from
`SURFACE_SECRET` (or the build-generated secret; `SURFACE_SECRET_PREVIOUS` decrypts during
rotation; secrets shorter than 32 bytes are rejected).

- `GET {BASE_PATH}/_surface/island/:componentId?p=<token>` (POST with the token as the body when it
  is longer than 2 KB) passes the middleware, decrypts and checks the token (400 when invalid, 409
  for another build), runs `load` and returns `{ "html": "…", "islands": [...] }`.
- `Cache-Control` is `private, no-store` unless the slot declares `cache` (GET only).
- The browser requests every deferred slot in parallel, drops a response when a transition already
  changed the slot, retries once after 1 s, then keeps the fallback and calls `reportError`.
