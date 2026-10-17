---
title: Accumulate Frame
order: 6
demoHref: /examples/chat
demoLabel: Chat Demo
---

## TL;DR {#tldr}

Accumulate is a frame option for content that grows. Instead of replacing a slot's props, an `accumulate: true` frame carries only the new part: arrays are appended, strings are concatenated, other values replace. Think of chat messages arriving one by one, or an AI answer building up token by token. This guide covers accumulate in depth; for every frame option (full, partial, accumulate) see the [Transition guide](/en/guide/transition).

## Mental model {#analogy}

:::analogy
Think of a group chat. When a new message arrives, the app appends it to the list — it does not reload the whole conversation. An accumulate frame works the same way: it says “add this to what you have”, not “replace everything with this”.
:::

Why “accumulate”? The engine piles each delta onto the slot's current state. Compare: a full frame replaces the transition's targets, a partial frame replaces specific slots, and an accumulate frame adds to specific slots.

:::callout{kind="info"}
In the chat demo, the bot's answer streams into `chat:current`, a client slot. Each delta travels as a small `merge` op, the browser appends it to the slot's props, and the component simply renders `text` — it keeps no copy of its own.
:::

## When to use {#when}

- Use for append-only UIs: chat messages, activity feeds, build logs.
- Use for token streaming (LLM answers) into a client slot, where each delta is a small `merge` op.
- Use for results that arrive in batches during one request: several sources, or a paginated API read page by page.
- Don't use to reset or shrink a slot — yield a full frame, or a partial frame with the new value.
- Don't use across requests: every request starts empty, so a “load more” button reads the list again and yields a full frame.

## Step-by-step {#steps}

:::sequence
1. Choose the slot mode: a client slot (`client:load`) for frequent deltas such as tokens. A server slot is fine for a few appends, but each one re-renders its HTML on the server.
2. Yield a full frame first that sets the starting value, such as `text: ''` or `messages: []`.
3. For each delta, yield `{ type: 'state', accumulate: true, states: { 'chat:current': { text: delta } } }` with only the new part.
4. The delta merges key by key into the slot's props: arrays concat, strings concat, other values (numbers, booleans, nested objects) replace, and keys missing from the delta stay.
5. Finish with a partial frame: the final content in `changed`, the streaming slot in `removed`.
6. To start over, yield a full frame — an accumulate frame never resets anything.
:::

## Minimal example {#example}

```ts label="✓ StateSurface — transitions/chat.ts"
// transitions/chat.ts → "chat"
import { defineTransition } from 'state-surface/server';
import { appendMessage, streamAnswer } from '../shared/chat.server';

export default defineTransition({
  targets: ['chat:messages', 'chat:current', 'chat:typing'],
  async *handler(params, ctx) {
    const text = String(params.message ?? '').trim();
    if (!text) return; // nothing to send: the engine answers with `done` only

    const history = await appendMessage({ role: 'user', text });

    // Full frame: the history (server slot), an empty bubble (client slot), the typing hint
    yield {
      type: 'state',
      states: {
        'chat:messages': { messages: history },
        'chat:current': { text: '' },
        'chat:typing': { text: 'Typing...' },
      },
    };

    // Accumulate frames: only the new characters → `merge` ops for the client slot
    let answer = '';
    for await (const token of streamAnswer(text, ctx.signal)) {
      answer += token;
      yield { type: 'state', accumulate: true, states: { 'chat:current': { text: token } } };
    }

    // Partial frame: store the answer, re-render the history, drop the bubble and the hint
    const messages = await appendMessage({ role: 'bot', text: answer });
    yield {
      type: 'state',
      full: false,
      states: { 'chat:messages': { messages } },
      changed: ['chat:messages'],
      removed: ['chat:current', 'chat:typing'],
    };
  },
});
```

```tsx label="routes/chat.tsx (excerpt) and the client component"
// routes/chat.tsx: the bubble is a client slot, so deltas arrive as `merge` ops
<main>
  <Slot name="chat:messages" mode="server" component={ChatMessages} />
  <Slot name="chat:current" client:load component={ChatCurrent} />
  <Slot name="chat:typing" mode="server" component={ChatTyping} />
</main>

// routes/chat/_components/ChatCurrent.tsx: renders the merged text, keeps no copy
export default function ChatCurrent({ text }: { text: string }) {
  return <p class="rounded-2xl bg-white px-4 py-2">{text}</p>;
}
```

:::callout{kind="info"}
**Invisible Power** — what accumulate gives you here:

- ✓ No local state: the component receives the merged `text` as props.
- ✓ A small wire: each token is one `merge` op with only the new characters.
- ✓ One repaint per animation frame: queued merges are folded before the DOM changes.
- ✓ A new message aborts the running answer, and the aborted handler never stores it.
- ✓ The history lives on the server, so a reload renders the same conversation.
:::

```tsx label="Traditional approach — manual stream reading, 3 bugs" collapsible
// React-style token streaming
import { useState, useRef } from 'react';

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [current, setCurrent] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function send(text: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages(list => [...list, { role: 'user', text }]);
    setCurrent('');

    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let answer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // ⚠️ BUG: without { stream: true } a character split across chunks is garbled
      answer += decoder.decode(value);
      setCurrent(answer);
    }
    // ⚠️ BUG: an abort throws above — the half-finished bubble is never cleared
    setMessages(list => [...list, { role: 'bot', text: answer }]);
    setCurrent('');
    // ⚠️ BUG: the history lives only in this tab — a reload loses it
  }

  return <ChatView messages={messages} current={current} onSend={send} />;
}
// + the /api/chat endpoint, error state and AbortError handling
```

## Execution sequence {#sequence}

:::sequence
1. The full frame with `'chat:current': { text: '' }` becomes one `patch` with `reset: true`: `html` ops for the server slots and `{ slot: 'chat:current', props: { text: '' } }` for the client slot.
2. An accumulate frame `{ 'chat:current': { text: 'Hel' } }` is merged into the request state, and the server sends `{ slot: 'chat:current', merge: { text: 'Hel' } }` right away.
3. The browser folds the `merge` ops queued within one animation frame and appends them to the props: `'Hel' + 'lo'` → `'Hello'`. The component re-renders with the merged props.
4. On a server slot, the server would render the merged props instead and send `html` ops: the first update at once, then at most one render per 33 ms, and a last one before `done`.
5. The final partial frame sends an `html` op for `chat:messages` and `remove` ops for `chat:current` and `chat:typing`; then the engine sends `done`.
6. The next request starts empty: its full frame sets `text: ''` again, so nothing carries over.
:::

## Common mistakes {#mistakes}

:::warning
The first frame of every request must be full — an accumulate frame first is a protocol violation, because there is nothing to add to yet. And every request starts empty: an accumulate frame never continues what a previous request streamed.
:::

:::checklist
- The first frame is full and sets the starting value (`text: ''`, `messages: []`).
- Accumulate frames carry only the delta, never the text so far.
- No `removed`, `ui` or `reset` on an accumulate frame — use a separate partial frame.
- The accumulated slot is in the transition targets and is not static.
- Frequent deltas such as tokens go to a client slot; a server slot re-renders its whole HTML.
- Appendable values (arrays, strings) sit at the top level of the slot props — nested objects are replaced, not deep-merged.
- Reset with a full frame — `messages: []` in an accumulate frame appends nothing.
:::

## Troubleshooting {#debug}

:::debug{symptom="The text shows up doubled or stuttering, like HeHelHello." cause="Each frame sends the whole text so far instead of only the new part."}
Yield only the delta (`text: token`). Keep the running total in a local variable if you need it at the end, as the example does with `answer`.
:::

:::debug{symptom="Development warns that server slots were rendered many times." cause="Tokens stream into a server slot, and every delta re-renders its whole HTML (at most every 33 ms)."}
Move the streaming part to a client slot (`client:load`) so that deltas travel as `merge` ops, and keep the finished history in a server slot.
:::

:::debug{symptom="A frame fails with: accumulate frame must not include removed." cause="One frame combines accumulate: true with removed (or ui, or reset)."}
Split it: yield the accumulate frame, then a separate partial frame (`full: false`) with `removed` or `uiChanged`.
:::

:::debug{symptom="The other keys of a nested object disappear." cause="Accumulate merges only the top level of the props; a nested object replaces the previous one."}
Keep appendable values (arrays, strings) at the top level of the slot props, or send the complete nested object each time.
:::

:::debug{symptom="The streaming bubble flickers or stays dimmed." cause="The slot has data-animate: the reveal animation restarts on every merge, and the pending style lasts for the whole request."}
Remove `data-animate` from the streaming slot and animate the slot that receives the final content instead.
:::

## Next: try it live {#next}

Open the [Chat Demo](/en/examples/chat) and ask about “accumulate”: the answer streams into a client slot through `merge` ops, the finished message lands in the server-rendered history, and sending a new message mid-answer aborts the old stream. The [Streaming Demo](/en/examples/streaming) shows an accumulate frame on a server slot, appending to the timeline array.
