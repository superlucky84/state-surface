
# **StateSurface**

> **A reference implementation of a state–layout mapping model.**

**Page navigation is MPA.**
Within a page, **DOM structure is synchronized to server-driven state streams.**

---

## 0. Implementation Risks (Priority Checklist)

Checked = design decision locked (still requires implementation validation).
Assumed by design = baseline requirement inherited from SSR + hydration.

**P0 — Core correctness**
* [x] `<h-state>` roots are stable anchors across SSR/CSR (`name` is the anchor)
* [x] SSR HTML and CSR VDOM structure match exactly (including text nodes) — Assumed by design
* [x] Initial hydration set matches the SSR state set (bootstrapped from server)
* [x] Hydration mismatch fallback defined (SSR hash → client render)
* [x] First post-hydration frame (first user action) does not cause remount/flicker

**P1 — Update accuracy**
* [x] Clear change-detection rule (server sends `changed`/`removed` per stream)
* [x] Data comparison strategy defined (no client compare) — Assumed by design
* [x] Removal policy for inactive states (default unmount, optional visibility)

**P2 — Stream/queue handling**
* [x] Queue backpressure policy (merge partials, full supersedes)
* [x] `done` / `error` frame handling defined
* [x] Frame ordering assumptions stated

**P3 — Module/bundling**
* [x] Template loading strategy decided (prebundle in v1)
* [x] Fallback when template load fails (error template)
* [ ] Stable template ↔ module mapping in Vite

**P4 — Performance/observability**
* [ ] `<h-state>` update frequency within budget
* [ ] Debug/tracing hooks for frame flow
* [ ] Optional dev UI to inspect `activeStates`

---

## 0. Purpose of This Document

This document exists to **freeze the core ideas of the project** so they are not lost or diluted over time.

### This is **not**:

* A complete framework spec
* A production architecture
* A promise of long-term maintenance

### This **is**:

* A **design record**
* An **executable mental model**
* A guide for building a **convincing prototype**
* A **reference others can re-implement better**

---

## 1. High-Level Philosophy

### 1.1 What This Is

**StateSurface is a state–layout mapping runtime.**

Implementation baseline:

* Backend: **Express-based**
* Frontend: **Lithent-based** rendering engine (from `skills/lithent`)

Design intent:

* Inspired by **HTML_Template_Sigma**-style block replacement
* **If/logic minimized** in templates; state drives composition
* `<h-state>` anchors map **state → template → data**

* The **server owns state**
* The **client owns DOM projection**
* HTML declares **existence conditions**, not behavior
* Views are **not programs**
* Views are **static surfaces selected by state**

> **Data streams define UI flow**

* Each frame in a transition stream carries **both state and data**
* The UI **progressively constructs itself** as frames arrive
* Views are paired with their data **at the frame level**

---

### 1.2 What This Is Not

❌ SPA framework
❌ Component system
❌ Template language
❌ HTML-over-the-wire (HTMX-style)

---

## 2. Navigation Model (MPA First)

### 2.1 Page Navigation

Page navigation is **pure MPA**.

* Handled by the browser
* Full HTML document per URL

```html
<a href="/article/1"> → full page load
```

---

### 2.2 Runtime Scope

The runtime only operates **within a page lifetime**.

* No client router
* No URL ↔ state syncing
* No hydration

---

## 3. State Model

### 3.1 State Is a Map, Not a Single Value

The current UI condition is represented as a **map of template → data**:

```js
activeStates = {
  "page:article:view": { articleId: 1 },
  "panel:comments:open": { articleId: 1, page: 1 }
}
```

States:

* Are opaque template names
* Have no hierarchy semantics
* Are matched by **exact name only**
* Carry **data bound to each template**

---

### 3.2 State Transitions

State changes are driven by **server-side transitions**, not client logic.

A transition:

* Is invoked by the client
* Is executed on the server
* Emits a **stream of state frames**

> **Full frames declare the complete UI state; partial frames declare changes**

---

## 4. Transport Model (State Streams)

### 4.1 Default Transport

* HTTP `POST` + `ReadableStream`
* One stream per transition
* Streams are ephemeral

```
transition request
→ state frames
→ done
→ connection closes
```

---

### 4.2 Why Not WebSocket by Default

* Persistent connections are expensive
* Most UI transitions are short-lived
* WebSocket is reserved for **optional long-lived subscriptions**
  (e.g. notifications)

---

## 5. Frame Model

A transition emits a **sequence of frames**:

```ts
type StateFrame =
  | {
      type: "state";
      states: Record<string, any>;
      full?: boolean;
      changed?: string[];
      removed?: string[];
    }
  | { type: "error"; message?: string; template?: string; data?: any }
  | { type: "done" }
```

**Important principles:**

* Frames describe **what is**, not what to do
* The client **never computes state**
* **Full frames replace state; partial frames merge by template key**
* **State and data flow together**
* **Views are bound to data at the frame level**
* Frames are **processed as a FIFO queue**
* The **last frame** becomes the final `activeStates`
* Updates are **data-only**; templates are already on the client
* The **first frame is always a full snapshot**

---

### 5.1 Progressive UI Construction

Frames arrive in sequence, and the UI constructs itself progressively.

#### Server-side transition

```ts
async function* articleTransition(articleId) {
  yield {
    type: "state",
    states: {
      "page:article": { articleId },
      "loading": { articleId }
    }
  }

  const article = await db.getArticle(articleId)
  yield {
    type: "state",
    states: {
      "page:article": { articleId },
      "content:loaded": { article }
    }
  }

  const comments = await db.getComments(articleId)
  yield {
    type: "state",
    states: {
      "page:article": { articleId },
      "content:loaded": { article },
      "comments:loaded": { comments }
    }
  }

  yield { type: "done" }
}
```

#### Client-side views

```html
<h-state name="loading">
  <div class="spinner">Loading article...</div>
</h-state>

<h-state name="content:loaded">
  <article>
    <h1>{article.title}</h1>
    <p>{article.body}</p>
  </article>
</h-state>

<h-state name="comments:loaded">
  <section class="comments">
    <h2>Comments</h2>
    {comments}
  </section>
</h-state>
```

#### UI Flow

1. Frame 1 → loading appears
2. Frame 2 → article content replaces loading
3. Frame 3 → comments appear below

---

### 5.2 State Combinations Express Complex UI

```ts
async function* searchTransition(query) {
  yield {
    type: "state",
    states: {
      "search:input": { query }
    }
  }

  const cached = cache.get(query)
  if (cached) {
    yield {
      type: "state",
      states: {
        "search:input": { query },
        "results:cached": { results: cached }
      }
    }
  }

  const live = await api.search(query)
  yield {
    type: "state",
    states: {
      "search:input": { query },
      "results:live": { results: live }
    }
  }
}
```

```html
<h-state name="search:input">
  <input value="{query}" />
</h-state>

<h-state name="results:cached">
  <div class="results cached">{results}</div>
</h-state>

<h-state name="results:live">
  <div class="results live">{results}</div>
</h-state>
```

**No loading flags.
No cache invalidation logic.
The stream defines the entire flow.**

---

### 5.3 Full vs Partial Frames

* **Full frame**: `states` includes **all active templates**
* **Partial frame**: `states` includes **only changed templates**
* Partial frames **merge by template key**
* `removed` lists templates that must be unmounted
* **The first frame in a stream must be full**
* If `full` is omitted, it is treated as **true**

Client apply rule:

```js
if (frame.full) {
  activeStates = frame.states
} else {
  for (const key in frame.states) activeStates[key] = frame.states[key]
  for (const key of frame.removed || []) delete activeStates[key]
}
```

---

### 5.4 Frame Queue (Sequential Processing)

An action produces **a queue of StateFrames**.

* Frames are processed **in order**
* **Full frames** replace `activeStates`
* **Partial frames** merge by template key
* When the queue ends, the **last frame is the final state**
* **No skippable frames** in v1
* If the queue lags, **merge consecutive partial frames** (last write wins)
* When a **full frame** arrives, it **supersedes any pending partials**

Partial merging is a **delayed apply** strategy to keep UI responsive.

---

### 5.5 Change Detection (Stateless Streams)

The server is **stateless across requests** and stateful **only within a stream**.

* Each request produces a self-contained stream
* The server tracks **previous frame** only inside that stream
* It emits `changed` / `removed` keys per frame
* The client updates **only those keys**

Example:

```json
{
  "type": "state",
  "states": {
    "page:article:view": { "article": { "id": 1 } },
    "panel:comments:open": { "comments": [] }
  },
  "changed": ["page:article:view"],
  "removed": []
}
```

---

### 5.6 Error and Done Frames

Errors are **user-defined**. The server decides what to send in an error frame.

If an error template exists in the layout, it can be rendered; otherwise the
stream ends.

```json
{ "type": "error", "template": "system:error", "data": { "message": "..." } }
```

Client handling:

* If `template` is present **and** a matching `<h-state>` exists, render it as a
  **full frame**:
  `{ states: { "system:error": { ...data } }, full: true }`
* Otherwise, **stop processing** and surface the error (log/callback)

`done` indicates **end of stream**. The client should:

* Flush remaining queued frames
* Ignore any frames received after `done`

**Ordering assumption:** HTTP stream order is preserved; no reordering logic is required.

---

## 6. View Model

### 6.1 `<h-state>` Elements

HTML declares **state-bound layout fragments**:

```html
<h-state name="page:article:view">
  <article>
    <h1>{title}</h1>
  </article>
</h-state>
```

Rules:

* No `if`
* No `for`
* No expressions
* No JS
* `name` must match a **template key** in `activeStates`
* The template uses **only the data bound to its own key**

---

### 6.2 Structural Synchronization (Default)

* State active → element exists in DOM
* State inactive → element removed
* **Default policy: unmount inactive templates**

This keeps:

* Accessibility correct
* DOM truthful

---

### 6.3 Optional Visibility Mode

```html
<h-state name="panel:comments" mode="visibility">
```

* Hide/show instead of mount/unmount
* Intended for animations or local state preservation
* Use only when focus/scroll/local state must survive

---

### 6.4 Hydration Boundaries

`<h-state>` is the smallest hydration unit.

* **Do not hydrate the whole page**
* **Each active `<h-state>` is hydrated independently**
* After hydration, updates are **data-driven re-renders** of that template

---

### 6.5 Example: Layout + Templates (SSR → Hydration)

Page layout **declares `<h-state>` anchors only**:

```tsx
export default function Layout() {
  return (
    <html>
      <body>
        <header class="site-header">StateSurface</header>

        <main class="page">
          <h-state name="page:article:view"></h-state>
          <h-state name="panel:comments:open"></h-state>
        </main>

        <footer class="site-footer">©2026</footer>
      </body>
    </html>
  )
}
```

Template modules render **inside** each `<h-state>`:

```tsx
export function ArticleView({ article }) {
  return (
    <article>
      <h1>{article.title}</h1>
      <p>{article.body}</p>
    </article>
  )
}
```

Server fills anchors using template → data:

```js
const html = renderLayout()
const states = {
  "page:article:view": { article },
  "panel:comments:open": { comments }
}

const filled = fillHState(html, states)
```

fillHState sketch (HTML parser-based):

```js
function fillHState(html, states) {
  const dom = parseHTML(html)

  for (const el of dom.querySelectorAll('h-state[name]')) {
    const key = el.getAttribute('name')
    const data = states[key]

    if (!data) {
      el.innerHTML = ''
      continue
    }

    const Comp = templates[key]
    const inner = renderToString(h(Comp, data))
    el.innerHTML = inner
  }

  return serializeHTML(dom)
}
```

Initial state bootstrapping:

* The server **embeds the initial `activeStates`** in HTML
* The client **hydrates from that exact payload**
* After hydration, new states are applied **only in browser memory**

Example:

```html
<script id="__STATE__" type="application/json">
{"page:article:view":{"article":{"title":"..."}}}
</script>
```

```js
const initialStates = JSON.parse(
  document.getElementById('__STATE__').textContent
)
stateSurface.hydrate(initialStates)
```

Client hydrates **per `<h-state>` root**:

```js
for (const el of document.querySelectorAll('h-state[name]')) {
  const key = el.getAttribute('name')
  hydration(buildVDOM(key, activeStates[key]), el)
}
```

---

### 6.6 Hydration Mismatch Fallback (SSR Hash)

If hydration cannot be trusted, fall back to **client render** for that `<h-state>`.

Server embeds a hash of the SSR HTML for each anchor:

```html
<h-state name="page:article:view" data-ssr-hash="7e3a...">...</h-state>
```

Client compares the expected HTML hash and decides:

```js
const expected = renderToString(buildVDOM(key, activeStates[key]))
const expectedHash = hash(expected)
const ssrHash = el.getAttribute('data-ssr-hash')

if (ssrHash && expectedHash !== ssrHash) {
  el.innerHTML = ''
  render(buildVDOM(key, activeStates[key]), el)
} else {
  hydration(buildVDOM(key, activeStates[key]), el)
}
```

This keeps failure recovery **scoped to the `<h-state>` root**.

---

### 6.7 First Post-Hydration Frame

After hydration, **no automatic state change occurs**.

The first state frame is expected to arrive **only after user interaction**.
At that moment:

* Only changed `<h-state>` roots update
* Unchanged roots are untouched (no remount/flicker)

This guarantees a stable UI immediately after hydration.

---

### 6.8 Template Loading Strategy (v1)

Templates are **prebundled** into the client build.

* No runtime template fetching
* A **template registry** maps `name → module`
* SSR uses the same registry (Vite SSR in dev, built modules in prod)
* Lazy loading is **out of scope for v1**

---

### 6.9 Template Load Fallback

If a template module is missing or fails to load:

* Render the **error template** (if defined in layout)
* Otherwise, leave the `<h-state>` empty and log the issue

This keeps failures localized to a single template.

---

## 7. No Nested States

### 7.1 No Structural Nesting

* `<h-state>` elements **must not be nested**
* Nesting implies structural coupling, which this model rejects
* **Multiple states may be active simultaneously**
* The DOM reflects **all active states at once**

---

### 7.2 File-Level Chunking

Each file defines **state fragments**, not components.

```
views/
├─ page.article.html
├─ panel.comments.html
```

Fragments are composed at runtime via **slots**, not imports.

---

## 8. Data Binding

### 8.1 Simple Hole Substitution

```html
<h1>{title}</h1>
```

Rules:

* Key lookup only
* No expressions
* No formatting logic
* Data comes from the **current frame**

---

### 8.2 Data Scope

Full frames carry **complete data for all active states**.
Partial frames carry **data only for changed templates**.

```ts
yield {
  type: "state",
  states: {
    "page:article": { article: {...} },
    "panel:comments": { comments: [...] }
  }
}
```

**Binding rule:**
Template name → bound data (by convention)

---

### 8.3 Lists by Data Shape

If bound data is an array, the runtime repeats the node.

```html
<h-state name="comments:loaded">
  <div class="comment">
    <p>{author}</p>
    <p>{text}</p>
  </div>
</h-state>
```

No loop syntax.
Repetition is a **property of data**, not templates.

---

## 9. Runtime Responsibilities

The client runtime:

* Receives frames
* Updates `activeStates`
* Selects matching `<h-state>` fragments
* Projects data
* Applies minimal DOM changes
* **Processes frames sequentially (queue)**
* Hydrates **per `<h-state>`**, not per page
* Updates **only changed templates**
* Handles `error` and `done` frames

---

### 9.1 Minimal Runtime Core

```js
class StateSurface {
  activeStates = {}
  frameQueue = []
  instances = {}
  maxQueue = 20

  async transition(name, params) {
    const res = await fetch(`/transition/${name}`, {
      method: "POST",
      body: JSON.stringify(params)
    })

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const frame = JSON.parse(decoder.decode(value))

      if (frame.type === "state") {
        this.frameQueue.push(frame)
        this.flushQueue()
      }
    }
  }

  flushQueue() {
    while (this.frameQueue.length > 0) {
      if (this.frameQueue.length > this.maxQueue) {
        this.dropToNextFull()
      }

      let frame = this.frameQueue.shift()
      if (frame.type !== "state") continue

      if (frame.full === false) {
        frame = this.coalescePartials(frame)
      }

      this.applyFrame(frame)
    }
  }

  dropToNextFull() {
    const idx = this.frameQueue.findIndex(
      f => f.type === "state" && f.full !== false
    )
    if (idx > 0) this.frameQueue = this.frameQueue.slice(idx)
  }

  coalescePartials(first) {
    let merged = { ...first }
    while (
      this.frameQueue[0] &&
      this.frameQueue[0].type === "state" &&
      this.frameQueue[0].full === false
    ) {
      const next = this.frameQueue.shift()
      merged = {
        type: "state",
        full: false,
        states: { ...merged.states, ...next.states },
        removed: [
          ...new Set([...(merged.removed || []), ...(next.removed || [])])
        ],
        changed: [
          ...new Set([...(merged.changed || []), ...(next.changed || [])])
        ]
      }
    }
    return merged
  }

  applyFrame(frame) {
    if (frame.full !== false) {
      const removed = Object.keys(this.activeStates).filter(
        key => !(key in frame.states)
      )
      this.sync(frame.states, Object.keys(frame.states), removed)
      return
    }

    const nextStates = { ...this.activeStates, ...frame.states }
    for (const key of frame.removed || []) delete nextStates[key]
    this.sync(nextStates, frame.changed || Object.keys(frame.states), frame.removed)
  }

  sync(nextStates, changedKeys, removedKeys) {
    const prevStates = this.activeStates

    // remove inactive templates
    for (const key of removedKeys || []) this.unmount(key)

    // update changed templates
    for (const key of changedKeys || []) {
      if (!this.instances[key]) this.hydrate(key, nextStates[key])
      else this.update(key, nextStates[key])
    }

    this.activeStates = nextStates
  }
}
```

---

### 9.2 Lithent Integration

Lithent is used **only as a diffing engine**.

```js
sync() {
  const vdom = this.buildVDOM()
  lithentPatch(this.root, vdom)
}
```

* Hydration is applied **per `<h-state>` root**
* After hydration, updates are **patches on that root**
* No component API exposed
* Lithent is invisible
* **Just a DOM diff utility**

---

## 10. Composition & Customization

### 10.1 States as Extension Points

New behavior is introduced by **adding states**, not logic.

Examples:

* `page:article:view + role:admin`
* `page:article:view + mode:editing`

---

### 10.2 Packs (Optional)

```
article/
├─ states.json
├─ view.html
└─ transitions.ts
```

* Optional
* Non-semantic
* Invisible to runtime

---

## 11. End-to-End Example

(… 내용 동일, 구조 유지 …)

---

## 12. Prototype Scope

### Must demonstrate

* `<h-state>` DOM sync
* HTTP streamed transitions
* Progressive UI construction
* Frame-level data/state pairing

### Must not include

* Plugins
* Auth
* Error recovery
* Optimizations

---

## 13. Success Criteria

This succeeds if:

* The idea is understandable by **reading HTML**
* The demo feels **“weird but convincing”**
* Others can re-implement it independently
* A full flow is shown in **under 50 lines**

---

## 14. Guiding Sentences

> **Features are not implemented. They are composed by adding states.**

> **Data flows define UI flows. The stream is the state machine.**

> **The client is a dumb terminal. The server owns all logic.**
