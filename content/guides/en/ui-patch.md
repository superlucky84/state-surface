---
title: UI Patch
order: 7
demoHref: /examples/ui-patch
demoLabel: UI Patch Demo
---

## TL;DR {#tldr}

A UI patch lets a transition change how a slot looks — add or remove CSS classes and set CSS custom properties on its `<h-state>` element — without rendering the component inside it again. `states` drive content, `ui` drives presentation. They travel in the same frame; the browser applies the content first, then the UI.

## Mental model {#analogy}

:::analogy
Think of a building. The template is the interior — the furniture and decoration in each room. A UI patch is the facade: you can repaint the walls or tint the windows without moving a single chair. The frame of the building (`<h-state>`) stays where it is; only its outside changes.
:::

Why keep it apart from state? A state change re-renders: a server slot runs `load` and `render` again and its HTML is swapped, a client slot's component updates with new props. A UI patch skips all of that — the browser toggles classes and style properties on one element. The component never receives the patch, so it needs no `tone` prop and no conditional class logic for it.

:::callout{kind="info"}
A patch has three optional fields: `classAdd` and `classRemove` (arrays of class names) and `cssVars` (custom property → value). A frame's `ui` maps slot names to a patch or `null`, and each entry is the slot's **whole** patch: the next entry replaces it, `null` clears it.
:::

## When to use {#when}

- Use for tones and themes: warning, success or info on a card, a dark panel.
- Use for status marks: highlight a new row, an error border, an `is-stale` mark while fresh data loads.
- Use for values CSS can consume: `--progress: 40%`, `--card-accent: #10b981`.
- Don't use for content — that is what `states` and the template are for.
- Don't put `ui` on an accumulate frame — it is rejected; send a partial frame with `uiChanged` between the accumulate frames.
- Don't use for the first paint — SSR does not apply patches; write the initial classes on the `<Slot>` (see SSR and first load).
- Don't use for arbitrary styles — only class tokens and `--*` variables pass validation: no `style` strings, no `url(…)`.

## Step-by-step {#steps}

:::sequence
1. Write the looks in CSS: classes such as `.tone-warning`, and rules or template markup that read variables with a fallback, such as `var(--card-accent, #64748b)`.
2. Make the slot updatable — `mode="server"` or a `client:*` directive on the `<Slot>` (static slots reject every op) — and list it in the transition's `targets`.
3. In a full frame, put `ui: { 'app:card': { classAdd, classRemove, cssVars } }` next to `states`. A full frame sets the UI of every target: a target without an entry is cleared.
4. For a change of looks only, yield a partial frame with `full: false`, `states: {}`, `uiChanged: ['app:card']` and the `ui` entry. Nothing is rendered.
5. To clear a slot's patch, send `ui: { 'app:card': null }` (listed in `uiChanged` in a partial frame), or leave the slot out of a full frame's `ui`.
6. The browser applies the patch after the slot's content, on the `<h-state>` element itself: it undoes the previous patch's `classAdd` and `cssVars`, then removes `classRemove`, adds `classAdd` and sets `cssVars`.
:::

## Minimal example {#example}

```ts label="✓ Tone switch — content and looks in one frame"
// transitions/card-tone.ts → data-action="card-tone" data-params='{"tone":"success"}'
import { defineTransition } from 'state-surface/server';
import type { UiPatch } from 'state-surface';

const TONES: Record<string, UiPatch> = {
  warning: {
    classAdd: ['tone-warning'],
    classRemove: ['tone-success'],
    cssVars: { '--card-accent': '#f59e0b' },
  },
  success: {
    classAdd: ['tone-success'],
    classRemove: ['tone-warning'],
    cssVars: { '--card-accent': '#10b981' },
  },
};

export default defineTransition({
  targets: ['app:card'],
  async *handler(params) {
    const tone = params.tone === 'success' ? 'success' : 'warning';
    // Full frame: props for the template, a patch for its <h-state>
    yield {
      type: 'state',
      states: { 'app:card': { tone, label: `Current: ${tone}` } },
      ui: { 'app:card': TONES[tone] },
    };
  },
});
```

:::callout{kind="tip"}
The template receives `{ tone, label }` as props and renders content. The `<h-state name="app:card">` element itself gets the class and the variable — the template only reads `var(--card-accent)` in its markup or CSS, it never sees the patch.
:::

```css label="client/styles.css — the looks live in CSS"
/* Defaults first: the variable falls back when no patch is applied */
h-state[name='app:card'] {
  display: block;
  border: 2px solid var(--card-accent, #e2e8f0);
}
h-state.tone-warning {
  background: #fffbeb;
}
h-state.tone-success {
  background: #ecfdf5;
}
h-state.is-saved {
  outline: 2px solid var(--card-accent);
}
```

```ts label="Style-only partial — no load, no render"
// The template is not rendered again: only the <h-state> element changes.
// The entry replaces the slot's patch, so repeat what should stay.
const patch = TONES[tone];
yield {
  type: 'state',
  full: false,
  states: {},
  uiChanged: ['app:card'],
  ui: { 'app:card': { ...patch, classAdd: [...(patch.classAdd ?? []), 'is-saved'] } },
};

// Clear the slot's patch: back to the classes the page rendered
yield {
  type: 'state',
  full: false,
  states: {},
  uiChanged: ['app:card'],
  ui: { 'app:card': null },
};
```

## Execution sequence {#sequence}

:::diagram{label="Full frame with ui"}
```text
yield { type: 'state', states: { 'app:card': props }, ui: { 'app:card': patch } }
  │
  ├─ server: reduce → render 'app:card'          // slot state lives for this request only
  ├─ server: ui op for every target              // full frame: no entry → ui: null
  │    → { type: 'patch', reset: true, ops: [
  │         { slot: 'app:card', html },          // content ops first
  │         { slot: 'app:card', ui: patch } ] }  // then ui ops
  ▼
browser: <h-state name="app:card">
  ├─ 1. html → swap the content                  // props for a client slot
  └─ 2. ui   → patch the element itself
       ├─ undo(previous)                         // its classAdd and its cssVars
       ├─ classRemove → classList.remove(...)
       ├─ classAdd    → classList.add(...)
       └─ cssVars     → style.setProperty(...)
```
:::

:::diagram{label="Style-only partial (nothing rendered)"}
```text
yield { type: 'state', full: false, states: {}, uiChanged: ['app:card'],
        ui: { 'app:card': { cssVars: { '--card-accent': '#10b981' } } } }
  │
  ├─ server: no content change                   // no load, no render, no HTML
  │    → { type: 'patch', ops: [{ slot: 'app:card', ui: {…} }] }
  ▼
browser: <h-state name="app:card">
  └─ ui → replace the patch                      // the DOM inside stays untouched
```
:::

## SSR and first load {#ssr}

SSR does not apply UI patches. A patch exists only in the browser: the server keeps slot state for one request, every document load starts from the HTML the page renders, and `__SURFACE__` carries no UI snapshot. The first appearance therefore belongs to the page — write it as host attributes on the `<Slot>` (`class`, `style`, `data-*`, `aria-*`), and SSR puts them on the `<h-state>` element.

```tsx label="The page sets the first look, transitions change it later"
// routes/dashboard.tsx — the server picks the first appearance per request
import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Card from './dashboard/_components/card';

export default async function Page(ctx: SurfaceContext) {
  const tone = ctx.cookies.get('tone') === 'success' ? 'success' : 'warning';
  return (
    <html>
      <head>
        <title>Dashboard</title>
      </head>
      <body>
        <Slot name="app:card" mode="server" class={`tone-${tone}`}>
          <Card tone={tone} label={`Current: ${tone}`} />
        </Slot>
      </body>
    </html>
  );
}
```

```html label="SSR output"
<h-state name="app:card" class="tone-warning">
  <!-- <Card /> -->
</h-state>
```

:::callout{kind="note"}
Patches stack on top of these attributes. Replacing or clearing a patch undoes only what that patch did, by name — its `classAdd` classes and its `cssVars` — so the SSR class stays. Keep in mind:

- A class removed with `classRemove` (say the SSR `tone-warning`) is not put back when the patch is cleared — let each patch remove the other tones and add its own, as above.
- A patch class or variable with the same name as an SSR one leaves together with the patch.
- A `<Boot>` transition's `ui` arrives after the page is shown — fine for live data, a visible flash for a first paint.
- To keep a choice across reloads, store it on the server (for example a cookie the transition sets before its first frame) and render it on the `<Slot>`.
:::

## Common mistakes {#mistakes}

:::warning
`ui` is not allowed on an accumulate frame (`accumulate: true`): the frame is rejected — development throws with the transition name and frame number, production ends the request with an error. During a token stream, yield a separate partial frame with `uiChanged` between the accumulate frames.

Every full frame resets the UI of its targets. A full frame without `ui` clears the patches you sent before — send content-only updates as partial frames (`full: false` with `changed`), or repeat the `ui`.
:::

:::checklist
- Partial frames list every patched slot in `uiChanged`, and every `uiChanged` key has an entry in `ui`.
- Each entry is the slot's whole patch — repeat the classes and variables that should stay.
- Class names are single tokens of `A-Z a-z 0-9 _ : / [ ] . -`: `['badge', 'is-new']`, not `['badge is-new']`. Tailwind arbitrary values with `#`, `(` or `%` fail — pass colors and sizes through `cssVars`.
- `cssVars` keys start with `--`, and values contain none of `;` `{` `}` `\` `url(` `image-set(` `src(` `expression(`.
- The patched slot is in the transition's `targets` and is not static.
- In a full frame, a patched target also needs a `states` entry — a target missing from `states` is removed, patch included.
- Clear a patch with `null`, not by sending the opposite classes.
:::

## Troubleshooting {#debug}

:::debug{symptom="The classes never appear on the h-state element." cause="A partial frame carries ui but no uiChanged, so the patch is ignored."}
Add `uiChanged: ['app:card']` next to `ui` in partial frames. Full frames need no `uiChanged`: they set the UI of every target.
:::

:::debug{symptom="The tone disappears after a content update." cause="The update was a full frame without ui, and full frames reset the UI of every target."}
Send content updates as partial frames (`full: false`, `changed: ['app:card']`) — they keep the slot's patch — or include the `ui` entry again.
:::

:::debug{symptom="A style-only partial drops the earlier classes and variables." cause="Each ui entry replaces the slot's whole patch."}
Send the complete patch you want on screen, for example by spreading the previous one and adding to it.
:::

:::debug{symptom="The frame is rejected with a ui error." cause="ui on an accumulate frame, a class with a space or a character outside the token set, a cssVars key without the -- prefix or a forbidden value, or a static slot."}
The message names the slot and the field. Move `ui` to a partial frame, split class strings into tokens, pass colors through `cssVars` and give the slot `mode="server"` or a `client:*` directive.
:::

:::debug{symptom="The look flashes in after the page loads, or is gone after a reload." cause="The first appearance comes from a patch (for example a Boot transition), but SSR never applies patches."}
Render the initial classes as host attributes on the `<Slot>` in the page function. Store the user's choice on the server (a cookie) when it must survive reloads.
:::

## Next: try it live {#next}

Open the [UI Patch demo](/en/examples/ui-patch): the tone buttons send a full frame with `ui`, the style-only button sends a partial frame with `uiChanged`, and the reset button clears the patch with a full frame whose `ui` is empty — the preview card changes its looks while its template stays as it is.

- [Transition guide](/en/guide/transition) — how full, partial and accumulate frames work together.
- [Accumulate guide](/en/guide/accumulate) — streaming patterns, and why `ui` is not allowed there.
- [Action guide](/en/guide/action) — the buttons and forms that start these transitions.
