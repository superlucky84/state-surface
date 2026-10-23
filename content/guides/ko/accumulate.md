---
title: Accumulate 프레임
order: 6
demoHref: /examples/chat
demoLabel: 채팅 데모
---

## TL;DR {#tldr}

accumulate는 자라나는 콘텐츠를 위한 프레임 옵션입니다. 슬롯의 props를 교체하는 대신 `accumulate: true` 프레임은 새로운 부분만 담습니다: 배열은 이어 붙이고, 문자열은 연결하고, 그 밖의 값은 교체합니다. 채팅 메시지가 하나씩 도착하거나 AI 응답이 토큰 단위로 쌓이는 모습을 떠올리면 됩니다. 이 가이드는 accumulate를 깊이 다룹니다. 프레임 옵션(full, partial, accumulate) 전체는 [Transition 가이드](/ko/guide/transition)를 참고하세요.

## 비유로 이해하기 {#analogy}

:::analogy
단체 채팅방을 생각해보세요. 새 메시지가 오면 앱은 전체 대화를 다시 불러오지 않고 새 메시지만 목록에 추가합니다. accumulate 프레임도 같습니다: “가진 것에 이걸 추가해”라고 말하지, “전부 이걸로 교체해”라고 말하지 않습니다.
:::

왜 “accumulate”인가? 엔진이 각 delta를 슬롯의 현재 상태 위에 쌓아(accumulate) 올리기 때문입니다. 비교하면: full 프레임은 transition의 target을 교체하고, partial 프레임은 특정 슬롯을 교체하며, accumulate 프레임은 특정 슬롯에 추가합니다.

:::callout{kind="info"}
채팅 데모에서 봇의 응답은 client 슬롯인 `chat:current`로 스트리밍됩니다. 각 delta는 작은 `merge` op로 전송되고, 브라우저가 이를 슬롯의 props에 이어 붙이며, 컴포넌트는 `text`를 그대로 렌더할 뿐입니다 — 자기만의 복사본을 두지 않습니다.
:::

## 언제 사용하나 {#when}

- append-only UI에 사용합니다: 채팅 메시지, 활동 피드, 빌드 로그.
- client 슬롯으로 토큰을 스트리밍할 때(LLM 응답) 사용합니다. 각 delta가 작은 `merge` op가 됩니다.
- 요청 하나 동안 여러 번에 나눠 도착하는 결과에 사용합니다: 여러 소스, 또는 페이지 단위로 읽는 페이지네이션 API.
- 슬롯을 초기화하거나 줄일 때는 사용하지 마세요 — full 프레임, 또는 새 값을 담은 partial 프레임을 yield하세요.
- 요청 사이에서는 사용하지 마세요: 모든 요청은 빈 상태에서 시작하므로, “더 보기” 버튼은 목록을 다시 읽어 full 프레임을 yield합니다.

## 단계별 구현 {#steps}

:::sequence
1. 슬롯 모드를 고릅니다: 토큰처럼 잦은 delta에는 client 슬롯(`client:load`). 몇 번 추가하는 정도라면 server 슬롯도 괜찮지만, 추가할 때마다 서버에서 HTML을 다시 렌더합니다.
2. 먼저 시작 값을 정하는 full 프레임을 yield합니다. 예: `text: ''`, `messages: []`.
3. delta마다 새로운 부분만 담아 `{ type: 'state', accumulate: true, states: { 'chat:current': { text: delta } } }`를 yield합니다.
4. delta는 슬롯 props에 키 단위로 병합됩니다: 배열은 concat, 문자열은 concat, 그 밖의 값(숫자, 불리언, 중첩 객체)은 교체되고, delta에 없는 키는 그대로 남습니다.
5. partial 프레임으로 마무리합니다: 최종 콘텐츠는 `changed`에, 스트리밍하던 슬롯은 `removed`에.
6. 처음부터 다시 시작하려면 full 프레임을 yield합니다 — accumulate 프레임은 아무것도 초기화하지 않습니다.
:::

## 최소 예시 {#example}

```ts label="✓ StateSurface — transitions/chat.ts"
// transitions/chat.ts → "chat"
import { defineTransition } from 'state-surface/server';
import { appendMessage, streamAnswer } from '../shared/chat.server';

export default defineTransition({
  targets: ['chat:messages', 'chat:current', 'chat:typing'],
  async *handler(params, ctx) {
    const text = String(params.message ?? '').trim();
    if (!text) return; // 보낼 것이 없음: 엔진은 `done`만 응답

    const history = await appendMessage({ role: 'user', text });

    // Full 프레임: 기록(server 슬롯), 빈 말풍선(client 슬롯), 입력 중 표시
    yield {
      type: 'state',
      states: {
        'chat:messages': { messages: history },
        'chat:current': { text: '' },
        'chat:typing': { text: 'Typing...' },
      },
    };

    // Accumulate 프레임: 새 글자만 → client 슬롯에는 `merge` op
    let answer = '';
    for await (const token of streamAnswer(text, ctx.signal)) {
      answer += token;
      yield { type: 'state', accumulate: true, states: { 'chat:current': { text: token } } };
    }

    // Partial 프레임: 응답 저장, 기록 다시 렌더, 말풍선과 입력 중 표시 제거
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

```tsx label="routes/chat.tsx (발췌)와 client 컴포넌트"
// routes/chat.tsx: 기록은 서버 저장소에서 렌더(const history = await readHistory());
// 말풍선은 client 슬롯이라 delta가 `merge` op로 도착
<main>
  <Slot name="chat:messages" mode="server">
    <ChatMessages messages={history} />
  </Slot>
  <Slot name="chat:current" client:load component={ChatCurrent} />
  <Slot name="chat:typing" mode="server" component={ChatTyping} />
</main>

// routes/chat/_components/ChatCurrent.tsx: 병합된 text를 렌더, 복사본 없음
export default function ChatCurrent({ text }: { text: string }) {
  return <p class="rounded-2xl bg-white px-4 py-2">{text}</p>;
}
```

:::callout{kind="info"}
**Invisible Power** — 여기서 accumulate가 해주는 것들:

- ✓ 로컬 state 없음: 컴포넌트는 병합된 `text`를 props로 받습니다.
- ✓ 작은 전송량: 토큰 하나는 새 글자만 담은 `merge` op 하나입니다.
- ✓ 애니메이션 프레임당 한 번의 다시 그리기: 대기 중인 merge는 DOM이 바뀌기 전에 합쳐집니다.
- ✓ 새 메시지가 진행 중인 응답을 abort하고, abort된 handler는 그 응답을 저장하지 않습니다.
- ✓ 기록은 서버에 있으므로 새로고침해도 같은 대화가 렌더됩니다.
:::

```tsx label="기존 방식 — 수동 스트림 읽기, 버그 3개" collapsible
// React 방식 토큰 스트리밍
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
      // ⚠️ BUG: { stream: true } 없이는 청크 경계에서 잘린 문자가 깨짐
      answer += decoder.decode(value);
      setCurrent(answer);
    }
    // ⚠️ BUG: abort되면 reader.read()가 reject — 처리되지 않은 rejection, 쓰다 만 응답은 사라짐
    setMessages(list => [...list, { role: 'bot', text: answer }]);
    setCurrent('');
    // ⚠️ BUG: 기록이 이 탭에만 있음 — 새로고침하면 사라짐
  }

  return <ChatView messages={messages} current={current} onSend={send} />;
}
// + /api/chat 엔드포인트, 에러 상태, AbortError 처리
```

## 실행 시퀀스 {#sequence}

:::sequence
1. `'chat:current': { text: '' }`를 담은 full 프레임은 `reset: true`인 `patch` 하나가 됩니다: server 슬롯에는 `html` op, client 슬롯에는 `{ slot: 'chat:current', props: { text: '' } }`.
2. accumulate 프레임 `{ 'chat:current': { text: 'Hel' } }`은 요청 상태에 병합되고, 서버는 곧바로 `{ slot: 'chat:current', merge: { text: 'Hel' } }`을 보냅니다.
3. 브라우저는 한 애니메이션 프레임 안에 쌓인 `merge` op를 합쳐 props에 이어 붙입니다: `'Hel' + 'lo'` → `'Hello'`. 컴포넌트는 병합된 props로 다시 렌더됩니다.
4. server 슬롯이라면 서버가 병합된 props를 렌더해 `html` op를 보냅니다: 첫 갱신은 즉시, 이후에는 33ms당 최대 한 번, 그리고 `done` 전에 마지막 한 번.
5. 마지막 partial 프레임은 `chat:messages`에 `html` op를, `chat:current`와 `chat:typing`에 `remove` op를 보내고, 이어서 엔진이 `done`을 보냅니다.
6. 다음 요청은 빈 상태에서 시작합니다: full 프레임이 다시 `text: ''`를 설정하므로 아무것도 이어지지 않습니다.
:::

## 자주 하는 실수 {#mistakes}

:::warning
모든 요청의 첫 프레임은 full이어야 합니다 — 아직 추가할 대상이 없으므로 accumulate 프레임을 먼저 보내는 것은 프로토콜 위반입니다. 또한 모든 요청은 빈 상태에서 시작합니다: accumulate 프레임은 이전 요청이 스트리밍한 내용을 절대 이어가지 않습니다.
:::

:::checklist
- 첫 프레임이 full이고 시작 값을 정합니다(`text: ''`, `messages: []`).
- accumulate 프레임은 delta만 담고, 지금까지의 전체 텍스트를 담지 않습니다.
- accumulate 프레임에 `removed`, `ui`, `reset`이 없습니다 — 별도의 partial 프레임을 쓰세요.
- 누적하는 슬롯이 transition target에 있고 static이 아닙니다.
- 토큰처럼 잦은 delta는 client 슬롯으로 보냅니다. server 슬롯은 HTML 전체를 다시 렌더합니다.
- 이어 붙일 값(배열, 문자열)은 슬롯 props의 최상위에 둡니다 — 중첩 객체는 깊은 병합이 아니라 교체됩니다.
- 초기화는 full 프레임으로 합니다 — accumulate 프레임의 `messages: []`는 아무것도 추가하지 않을 뿐입니다.
:::

## 트러블슈팅 {#debug}

:::debug{symptom="텍스트가 HeHelHello처럼 중복되거나 더듬듯 표시됩니다." cause="각 프레임이 새로운 부분이 아니라 지금까지의 전체 텍스트를 보냅니다."}
delta만 yield하세요(`text: token`). 마지막에 전체 텍스트가 필요하면 예시의 `answer`처럼 지역 변수에 누적하세요.
:::

:::debug{symptom="개발 모드에서 server 슬롯이 너무 많이 렌더되었다고 경고합니다." cause="토큰이 server 슬롯으로 스트리밍되어 delta마다 HTML 전체가 다시 렌더됩니다(최대 33ms마다)."}
스트리밍 부분을 client 슬롯(`client:load`)으로 옮겨 delta가 `merge` op로 전송되게 하고, 완성된 기록은 server 슬롯에 두세요.
:::

:::debug{symptom='개발 모드에서 프레임이 실패합니다: Accumulate frame must not include "removed" (프로덕션에서는 "Transition failed").' cause="한 프레임에 accumulate: true와 removed(또는 ui, reset)가 함께 있습니다."}
나누세요: accumulate 프레임을 yield한 뒤, `removed`나 `uiChanged`를 담은 별도의 partial 프레임(`full: false`)을 yield하세요.
:::

:::debug{symptom="중첩 객체의 다른 키가 사라집니다." cause="accumulate는 props의 최상위만 병합하므로 중첩 객체는 이전 객체를 교체합니다."}
이어 붙일 값(배열, 문자열)은 슬롯 props의 최상위에 두거나, 중첩 객체 전체를 매번 보내세요.
:::

:::debug{symptom="스트리밍 중인 말풍선이 깜박이거나 계속 흐리게 보입니다." cause="슬롯에 data-animate가 있어 merge마다 표시 애니메이션이 다시 시작되고, pending 스타일이 요청 내내 유지됩니다."}
스트리밍 슬롯에서 `data-animate`를 제거하고, 최종 콘텐츠를 받는 슬롯에 애니메이션을 적용하세요.
:::

## 다음: 직접 실습 {#next}

[채팅 데모](/ko/examples/chat)를 열고 “accumulate”에 대해 물어보세요: 응답이 `merge` op로 client 슬롯에 스트리밍되고, 완성된 메시지는 서버가 렌더한 기록에 들어가며, 응답 도중 새 메시지를 보내면 이전 스트림이 abort됩니다. [스트리밍 데모](/ko/examples/streaming)는 server 슬롯의 accumulate 프레임이 timeline 배열에 항목을 추가하는 모습을 보여줍니다.
