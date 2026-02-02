
# **StateSurface**

> **A reference implementation of a state–layout mapping model.**

**Page navigation is MPA.**
Within a page, **DOM structure is synchronized to server-driven state streams.**

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

### 3.1 State Is a Set, Not a Single Value

The current UI condition is represented as a **set of active state names**:

```js
activeStates = new Set([
  "page:article:view",
  "panel:comments:open"
])
```

States:

* Are opaque strings
* Have no hierarchy semantics
* Are matched by **exact name only**

---

### 3.2 State Transitions

State changes are driven by **server-side transitions**, not client logic.

A transition:

* Is invoked by the client
* Is executed on the server
* Emits a **stream of state frames**

> **Each frame declares the complete UI state at that moment**

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
  | { type: "state"; states: string[]; data?: any }
  | { type: "error"; message: string }
  | { type: "done" }
```

**Important principles:**

* Frames describe **what is**, not what to do
* The client **never computes state**
* **Each frame replaces the previous state entirely**
* **State and data flow together**
* **Views are bound to data at the frame level**

---

### 5.1 Progressive UI Construction

Frames arrive in sequence, and the UI constructs itself progressively.

#### Server-side transition

```ts
async function* articleTransition(articleId) {
  yield {
    type: "state",
    states: ["page:article", "loading"],
    data: { articleId }
  }

  const article = await db.getArticle(articleId)
  yield {
    type: "state",
    states: ["page:article", "content:loaded"],
    data: { article }
  }

  const comments = await db.getComments(articleId)
  yield {
    type: "state",
    states: ["page:article", "content:loaded", "comments:loaded"],
    data: { article, comments }
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
    states: ["search:input"],
    data: { query }
  }

  const cached = cache.get(query)
  if (cached) {
    yield {
      type: "state",
      states: ["search:input", "results:cached"],
      data: { query, results: cached }
    }
  }

  const live = await api.search(query)
  yield {
    type: "state",
    states: ["search:input", "results:live"],
    data: { query, results: live }
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

---

### 6.2 Structural Synchronization (Default)

* State active → element exists in DOM
* State inactive → element removed

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

Each frame carries **complete data for all active states**.

```ts
yield {
  type: "state",
  states: ["page:article", "panel:comments"],
  data: {
    article: {...},
    comments: [...]
  }
}
```

**Binding rule:**
State name → data key (by convention)

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
* **Processes frames sequentially**

---

### 9.1 Minimal Runtime Core

```js
class StateSurface {
  activeStates = new Set()
  currentData = {}

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
        this.activeStates = new Set(frame.states)
        this.currentData = frame.data || {}
        this.sync()
      }
    }
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
