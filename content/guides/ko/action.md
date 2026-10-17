---
title: Action
order: 5
demoHref: /examples/actions
demoLabel: 액션 플레이그라운드
---

## TL;DR {#tldr}

Action은 사용자 이벤트를 서버 [transition](/ko/guide/transition)에 연결합니다. 버튼이나 폼에 `data-action="cart/update"`를 붙이면 나머지는 엔진이 처리합니다. 이벤트 시점에 params를 읽어 전송하고, 영향받는 슬롯을 pending으로 표시하고, 충돌하는 요청을 취소하고, 스트리밍된 결과를 반영합니다. 진입점은 세 가지이며 모두 같은 액션 런타임 위에서 동작합니다.

- 버튼·링크·폼의 `data-action` + `data-params` — 작성할 이벤트 핸들러가 없습니다.
- `<form method="post" action={actionUrl('comments/add')}>` — JS 없이도 동작하고(POST, 리다이렉트, 일회성 flash), JS가 실행되면 스트리밍합니다.
- 클라이언트 컴포넌트의 `useAction(renew, 'like')` — 타입이 지정된 params와 `pending`, `error`, 결과 Promise를 제공합니다.

## 비유로 이해하기 {#analogy}

:::analogy
Action은 호텔 객실 TV 리모컨입니다. 버튼마다 채널 이름(`data-action`)이 붙어 있고, 실제로 채널(transition)을 바꾸는 일은 TV(엔진)가 합니다. 신호 배선은 직접 하지 않습니다 — 버튼에 이름만 붙이면 됩니다. 이전 채널이 아직 맞춰지는 중에 새 채널을 누르면 TV는 이전 것을 버립니다. 볼륨 버튼은 다른 대상(다른 targets)을 조작하므로 동시에 계속 동작합니다.
:::

배선을 비교해 보세요. React 앱에서는 버튼이 핸들러를 호출 → `fetch` → `setState` → 다시 렌더링하고, 로딩·에러·경쟁 상태는 직접 처리해야 합니다. StateSurface에서는 버튼에 `data-action="name"` → 엔진이 POST → 서버가 프레임을 yield → 슬롯이 갱신됩니다. 배선은 내장되어 있고, transition 이름만 정하면 됩니다.

:::callout{kind="tip"}
React에서 오셨다면: `data-action`은 params를 서버로 보내고 응답을 페이지에 스트리밍해 주는, 미리 배선된 `onClick` / `onSubmit`이라고 생각하세요. `useState`도, `fetch`도, `AbortController`도 필요 없습니다. 컴포넌트가 요청 상태를 꼭 알아야 할 때(비활성화 버튼, 필드별 에러 표시)는 같은 런타임을 훅 형태로 쓰는 `useAction`을 사용합니다.
:::

## 언제 사용하나 {#when}

- 서버 상태를 불러오거나 바꾸는 클릭과 제출에는 `data-action`을 사용합니다: 검색, 필터, 장바구니 담기, 좋아요, 삭제.
- JS가 로드되기 전이나 JS 없이도 동작해야 하는 폼에는 `<form method="post" action={actionUrl('name')}>`을 사용합니다: 댓글, 가입, 설정.
- `pending`, `error`, 결과가 필요한 클라이언트 컴포넌트에서는 `useAction(renew, 'name')`을 사용합니다 — 비활성화 버튼, 필드별 에러, 토스트.
- 사용자가 실제로 기다리는 슬롯에만 로딩 표시를 두려면 `data-pending-targets`를 사용합니다.
- 페이지 이동에는 액션을 쓰지 마세요 — `<a href>`를 사용합니다(레이아웃에 `<ClientRouter />`가 있으면 링크가 클라이언트 내비게이션이 됩니다).
- `fetch('/transition/…')`를 직접 호출하지 마세요 — 런타임이 빌드·페이지 헤더, 동시성, pending 표시, 에러 처리를 더해 줍니다.

## 단계별 구현 {#steps}

:::sequence
1. transition을 만듭니다. `transitions/` 아래 경로가 액션 이름입니다: `transitions/cart/update.ts` → `cart/update`. 바꾸는 슬롯을 `targets`로 선언합니다.
2. `<button>`이나 `<form>`에 `data-action="cart/update"`를 추가합니다 — 슬롯 template 안이든 페이지 마크업 어디든 됩니다.
3. 고정 params가 있다면 `data-params`에 JSON 객체로 적습니다(선택). 폼은 이름이 있는 필드와 클릭된 submit 버튼을 더하며, 같은 이름이면 필드 값이 `data-params` 키보다 우선합니다.
4. `data-pending-targets="cart:summary"`로 로딩 표시 범위를 좁히고(선택, 기본값: transition의 targets, 없으면 모든 슬롯) CSS로 스타일을 줍니다. 예: `h-state[data-pending] { opacity: 0.5 }`.
5. `input`에 Standard Schema를 지정해 검증합니다(선택). 잘못된 params는 handler에 도달하지 않고, 액션은 `fieldErrors`를 담은 `validation` 에러로 끝납니다.
6. JavaScript는 작성하지 않습니다: 엔진이 `document`에서 `click`과 `submit`을 수신합니다. `useAction`은 요청 상태가 필요한 클라이언트 컴포넌트 안에서만 사용합니다.
:::

## 최소 예시 {#example}

```tsx label="✓ StateSurface — 마크업 14줄, 이벤트 핸들러 0개"
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

```ts label="transitions/cart/update.ts — 파일 경로가 곧 액션 이름"
// transitions/cart/update.ts → data-action="cart/update"
import { defineTransition } from 'state-surface/server';
import { saveShipping } from '../../shared/cart.server';

export default defineTransition({
  // 이 액션이 바꾸는 슬롯: 다른 슬롯의 액션은 병렬로 계속 실행됨
  targets: ['cart:summary'],
  async *handler(params, ctx) {
    // params = { shipping: 'express', intent: 'order' } — 필드 값과 클릭된 버튼
    const cart = await saveShipping(ctx, String(params.shipping), params.intent === 'order');
    // 페이지는 <Slot name="cart:summary" mode="server"><CartSummary … /></Slot>을 렌더링
    yield { type: 'state', states: { 'cart:summary': cart } };
  },
});
```

:::callout{kind="info"}
**Invisible Power** — 이 폼에서 `data-action`이 대신 처리하는 것들:

- `onSubmit`·`onChange` 0개 — 폼을 제출하는 순간 필드 값과 클릭된 버튼을 읽음
- `fetch` 0줄 — 엔진이 빌드·페이지 헤더와 함께 `/transition/cart/update`로 POST
- 로딩 상태 관리 0줄 — 요청이 끝날 때까지 `cart:summary`에 `data-pending` 유지
- 경쟁 상태 없음 — 두 번째 제출이 첫 요청을 abort하고, 다른 슬롯의 액션은 계속 실행
- 에러 배선 없음 — throw한 `TransitionError`가 페이지의 `system:error` 슬롯에 표시됨
- 클라이언트 컴포넌트 없음 — 요약은 서버 HTML이라 컴포넌트 JavaScript가 전송되지 않음
:::

```tsx label="기존 방식 — 49줄, 수동 폼 상태 + fetch + abort" collapsible
// React 방식 배송 폼 — 수동 state, fetch, abort
import { useRef, useState } from 'react';

function ShippingForm() {
  const [shipping, setShipping] = useState('standard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // 어떤 버튼이 클릭됐나? 네이티브 이벤트에서 직접 꺼내야 함
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
      // ⚠️ 요약은 다른 컴포넌트에 있음: state 끌어올리기 또는 스토어 추가 필요
      updateCartSummary(await res.json());
    } catch (err) {
      // ⚠️ abort된 요청은 에러를 표시하면 안 됨
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      // ⚠️ BUG: abort된 요청이 더 새로운 요청의 로딩 상태를 해제함
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

클라이언트 컴포넌트 안에서는 `useAction`이 같은 런타임을 실행하고 요청 상태에 따라 컴포넌트를 다시 렌더링합니다. 이름과 params의 타입은 빌드가 `transitions/**`에서 생성하는 `.state-surface/actions.d.ts`에서 옵니다.

```tsx label="useAction — 타입이 지정된 params를 쓰는 클라이언트 아일랜드"
// routes/posts/_components/likeButton.tsx — <LikeButton client:load />로 렌더링
import { mount } from 'lithent';
import { useAction } from 'state-surface/client';

const LikeButton = mount(renew => {
  const like = useAction(renew, 'like'); // run({ delta })를 transitions/like.ts 기준으로 타입 검사
  const onClick = async () => {
    const result = await like.run({ delta: 1 }); // throw하지 않음
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

JS가 로드되기 전에도, 혹은 JS 없이도 동작해야 하는 폼은 `actionUrl(name)`으로 POST합니다. JS가 없으면 서버가 transition을 끝까지 실행하고 `303`으로 응답하며 결과를 일회성 flash 쿠키에 남깁니다. JS가 있으면 엔진이 submit을 가로채 같은 transition을 스트림으로 실행합니다.

```tsx label="JS 없이 동작하는 폼 — transition 하나, 경로 둘"
// transitions/comments/add.ts
import { z } from 'zod';
import { defineTransition } from 'state-surface/server';

export default defineTransition({
  input: z.object({ postId: z.string(), body: z.string().min(1) }), // 어떤 Standard Schema든 가능
  targets: ['comments:list'],
  flash: { input: ['body'] }, // JS 없는 제출이 검증에 실패하면 입력값을 되돌려 줌
  async *handler({ postId, body }, ctx) {
    await db.addComment(postId, body);
    yield { type: 'state', states: { 'comments:list': { postId } } };
  },
});

// routes/posts/[id].tsx — 리다이렉트 후 페이지가 결과를 한 번 읽음
const flash = await ctx.flash('comments/add'); // { ok, error?, input? } 또는 undefined
const form = (
  <form method="post" action={actionUrl('comments/add')}>
    <input type="hidden" name="postId" value={ctx.params.id} />
    <textarea name="body">{String(flash?.input?.body ?? '')}</textarea>
    {flash?.error && <p role="alert">{flash.error.message}</p>}
    <button type="submit">Post</button>
  </form>
);
```

## 실행 시퀀스 {#sequence}

:::sequence
1. 사용자가 `[data-action]` 요소 안을 클릭하거나, `data-action`이 있는 폼(또는 `actionUrl()`로 POST하는 폼)을 제출합니다. 엔진은 `document`에서 버블 단계로 수신합니다. 컴포넌트가 이미 `preventDefault()`를 호출했다면 엔진은 그 이벤트를 건드리지 않고, 아니면 직접 `preventDefault()`를 호출합니다. 이벤트 하나는 액션 하나만 실행합니다.
2. 엔진이 이벤트 시점에 호출 정보를 스냅샷합니다: `data-action`, `data-params`, submitter의 name·value를 포함한 폼 필드(같은 이름이 반복되면 배열, 파일을 선택했다면 multipart 본문), `data-pending-targets`.
3. 동시성: 같은 이름이거나 targets가 겹치는 진행 중 요청을 abort합니다. `mode: 'queue'`이면 대신 같은 이름의 이전 요청이 끝나기를 기다립니다.
4. pending 앵커에 `data-pending`이 붙습니다: `data-pending-targets` 목록, 없으면 transition의 targets, 그것도 없으면 모든 슬롯.
5. `X-Surface-Build`, `X-Surface-Page` 헤더와 함께 `POST /transition/cart/update`가 전송됩니다. `input` 스키마가 있으면 서버가 먼저 검증합니다: 잘못된 params는 422 `validation` 에러로 끝나고 handler는 실행되지 않습니다.
6. handler가 프레임을 yield하면 서버가 이를 리듀스해 슬롯별 op를 보냅니다 — server 슬롯에는 HTML, client 슬롯에는 props나 merge. 브라우저는 애니메이션 프레임마다 한 번씩 반영하고, 첫 결과 이후에는 앵커에 `data-has-result`도 붙입니다.
7. handler가 반환되면 엔진이 `done`을 보냅니다: 표시가 제거되고 `run()`이 `{ ok: true }`로 resolve됩니다. throw는 `system:error`에 표시되는 `error` 프레임이 되고 `{ ok: false, error }`로, abort는 `{ ok: false, aborted: true }`로 resolve됩니다.
:::

:::callout{kind="info"}
동시성은 `defineTransition`에 선언한 `targets`로 결정됩니다:

- 같은 이름을 다시 실행 → 이전 요청을 abort합니다(검색 폼에 빠르게 입력해도 안전).
- targets가 겹침 → 이전 요청을 abort합니다. targets가 겹치지 않음 → 둘 다 실행합니다(느린 검색 중에 좋아요).
- `targets` 없음 → 모든 슬롯과 겹치는 것으로 봅니다: 모든 요청을 abort하고, 어떤 요청이든 이 요청을 abort합니다(개발 모드에서 한 번 경고).
- `mode: 'queue'` → 같은 이름의 요청을 순서대로 하나씩 실행합니다(좋아요 버튼의 클릭이 모두 반영됨).
:::

## 흔한 실수 {#mistakes}

:::warning
`data-params`는 키와 문자열을 큰따옴표로 감싼 JSON **객체**여야 합니다. `data-params="{query: 'foo'}"`는 파싱되지 않습니다: 액션은 실행되지만 params가 `{}`가 됩니다(디버그 모드 `?debug=1`에서는 콘솔에 파싱 에러가 표시됩니다). `data-params='{"query":"foo"}'`로 쓰거나, template에서 계산한 값이라면 `data-params={JSON.stringify({ query })}`를 사용하세요.
:::

:::checklist
- 이름은 확장자를 뺀 `transitions/` 아래 파일 경로이며 kebab-case입니다: `transitions/cart/update.ts` → `data-action="cart/update"`.
- 전송할 모든 컨트롤에 `name`이 있고, `data-action`은 submit 버튼이 아니라 `<form>`에 있습니다.
- 같은 이름의 폼 필드는 `data-params` 키를 덮어씁니다 — 고정 값과 필드 이름을 겹치지 않게 둡니다.
- 체크박스 그룹은 하나만 체크하면 문자열, 여러 개를 체크하면 배열을 보냅니다 — handler나 스키마에서 둘 다 받습니다.
- 나란히 실행돼야 하는 transition은 서로 겹치지 않는 `targets`를 선언합니다. `targets` 생략은 모든 요청을 취소해도 되는 액션에만 씁니다.
- `data-pending-targets`는 쉼표로 구분한 슬롯 이름 목록입니다. 예: `data-pending-targets="cart:summary,cart:badge"`.
- `useAction`은 컴포넌트가 unmount돼도 요청을 abort하지 않습니다 — 컴포넌트와 함께 멈춰야 하면 `abort()`를 호출합니다.
- JS 없는 폼의 결과를 보여 주는 페이지는 prerender하지 마세요: prerender된 페이지는 `ctx.flash()`를 읽을 수 없습니다.
:::

## 디버깅 체크리스트 {#debug}

:::debug{symptom="클릭해도 아무 반응이 없습니다 — Network 탭에 요청이 나타나지 않습니다." cause="속성 이름 오타(data-transition, action), 컴포넌트 핸들러가 이벤트에 preventDefault()를 호출함, 또는 document 리스너가 들여다볼 수 없는 shadow root 안에 요소가 있음."}
요소를 검사하세요: `data-action`이 그 요소나 조상에 있어야 합니다. `preventDefault()`를 호출하는 핸들러는 의도적으로 이벤트를 가져가는 것입니다 — 그 컴포넌트에서 `useAction(renew, 'name')` 핸들을 만들고 핸들러에서 `run()`을 호출하세요.
:::

:::debug{symptom="요청이 404로 응답합니다." cause="그 이름으로 등록된 transition이 없습니다."}
이름은 `transitions/` 아래 경로입니다(`transitions/comments/add.ts` → `comments/add`). `_`로 시작하는 파일과 폴더는 transition이 아니라 헬퍼입니다. `.state-surface/actions.d.ts`에 등록된 이름이 모두 나열됩니다. `useAction`, `<Boot>`, `actionUrl()`은 이를 기준으로 타입 검사되지만 `data-action` 문자열은 검사되지 않습니다.
:::

:::debug{symptom="handler가 빈 params를 받거나 폼 필드가 빠집니다." cause="data-params가 유효한 JSON이 아니거나, 컨트롤에 name이 없거나, data-action이 폼이 아닌 submit 버튼에 있습니다."}
`?debug=1`로 페이지를 열어 콘솔에서 `data-params` 파싱 에러를 확인하고, 모든 컨트롤에 `name`을 추가하고, `data-action`을 `<form>`으로 옮기세요 — 버튼에 있으면 그 버튼의 `data-params`만 전송됩니다.
:::

:::debug{symptom="다른 액션이 시작되면 실행 중인 액션이 취소됩니다." cause="transition 중 하나가 targets를 선언하지 않았거나, 두 targets가 겹칩니다."}
병렬로 실행하려면 두 transition 모두에 서로 겹치지 않는 `targets`를 선언하세요. 같은 이름을 반복 실행해도 모두 완료돼야 한다면 `mode: 'queue'`를 지정하세요.
:::

:::debug{symptom="run()이 error.kind validation으로 resolve됩니다." cause="input 스키마가 params를 거부해 handler가 실행되지 않았습니다."}
`error.fieldErrors`(필드 경로 → 메시지)를 해당 필드 옆에 표시하세요. 폼 값은 문자열로 도착하므로 숫자는 스키마에서 변환하세요. 예: `z.coerce.number()`.
:::

:::debug{symptom="JS 없는 폼이 리다이렉트되지만 결과가 보이지 않습니다." cause="페이지가 같은 이름으로 flash를 읽지 않았거나, flash를 이미 읽었거나, 페이지가 prerender되었습니다."}
페이지 함수나 server 컴포넌트의 `load`에서 transition 이름 그대로 `await ctx.flash('comments/add')`를 읽으세요. flash는 60초 안에 한 번만 읽을 수 있고, prerender된 페이지에서는 읽을 수 없습니다.
:::

## 다음: 직접 실습 {#next}

[액션 플레이그라운드](/ko/examples/actions)를 열어 보세요: 버튼·폼 액션, 범위를 좁힌 pending 표시, 느린 플레이그라운드 액션과 병렬로 실행되며 빠른 클릭을 순서대로 처리하는 `useAction` 좋아요 버튼, JavaScript를 꺼도 동작하는 댓글 폼이 있습니다.

- [Transition 가이드](/ko/guide/transition) — 서버 쪽의 targets, 프레임, 에러.
- [UI Patch 가이드](/ko/guide/ui-patch) — 같은 액션에서 슬롯의 클래스와 CSS 변수 바꾸기.
- [Accumulate 가이드](/ko/guide/accumulate) — 액션이 실행되는 동안 client 슬롯에 텍스트 스트리밍.
