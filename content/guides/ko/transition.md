---
title: Transition
order: 4
demoHref: /examples/streaming
demoLabel: 스트리밍 데모
---

## TL;DR {#tldr}

Transition은 UI 상태를 단계별로 스트리밍하는 서버 함수입니다. `transitions/**/*.ts`에 두며, `yield` 한 번이 상태 프레임 하나 — 슬롯 하나 이상의 props — 를 보냅니다. 먼저 로딩 스켈레톤을 yield하고 데이터가 준비되면 실제 결과를 yield하세요. yield 순서가 곧 사용자가 보는 순서입니다. handler가 return하면 엔진이 `done`을 보내고, throw하면 사용자에게 에러 메시지가 보입니다.

## 비유로 이해하기 {#analogy}

:::analogy
Transition은 영상의 실시간 자막 피드와 같습니다. 영상 — HTML 페이지 — 은 그대로 있고 자막만 한 줄씩 흘러 들어옵니다. `yield` 한 번이 자막 한 줄입니다. 엔진이 열린 HTTP 응답으로 그 줄을 보내면 브라우저는 해당 `<h-state>`에 바로 표시합니다.
:::

왜 “Transition”인가? 서버가 화면을 하나의 UI 상태에서 다음 상태로 — 로딩 중, 일부 도착, 완료 — 전환(transition)한다는 뜻입니다. CSS transition이나 View Transition API와는 관계없습니다(transition이 View Transition을 선택적으로 켤 수는 있습니다. 아래 애니메이션 프리셋 참고). 이름이 헷갈리면 “상태 스트림”으로 읽으세요.

:::callout{kind="info"}
왜 GET이 아니라 POST인가? transition은 지금 서버 로직을 실행합니다. 요청 본문·쿠키·서비스를 읽고 데이터를 쓸 수도 있습니다. GET 응답은 캐시되고 prefetch되고 북마크되지만, 페이지 내 갱신은 그 어느 것도 되어서는 안 됩니다. 엔진은 모든 transition 요청에서 `Origin`도 검사합니다.
:::

## 언제 사용하나 {#when}

- 서버가 결정하는 모든 페이지 내 갱신에 사용합니다: 데이터 로딩, 폼 제출, 버튼 클릭, 오래 걸리는 작업의 진행 상황.
- 점진적 렌더링에 사용합니다: 스켈레톤 먼저, 그다음 캐시 데이터, 그다음 최신 데이터 — 항상 이 순서로.
- 토큰이나 로그 줄 같은 스트리밍 출력에 accumulate 프레임과 함께 사용합니다.
- 다른 페이지로 이동할 때는 사용하지 마세요 — `<a href>`를 사용하세요(전체 페이지 로드, 또는 `<ClientRouter />`로 클라이언트 내비게이션).
- 브라우저만 신경 쓰는 상태(열린 메뉴, 작성 중인 초안)에는 사용하지 마세요 — client 컴포넌트에 두세요.

## 단계별 구현 {#steps}

:::sequence
1. `transitions/search.ts`를 만듭니다. 파일 경로가 곧 이름입니다: `transitions/search.ts` → `search`, `transitions/comments/add.ts` → `comments/add` (kebab-case 세그먼트).
2. `state-surface/server`에서 `defineTransition`을 import하고 `export default defineTransition({ targets, async *handler(params, ctx) { … } })`를 작성합니다.
3. 이 transition이 바꿀 수 있는 슬롯을 `targets`에 나열합니다. 각 슬롯의 상태는 그 `<Slot>` 안 컴포넌트의 props입니다.
4. 첫 `yield`는 full 프레임으로 만듭니다: 모든 target의 상태를 담은 `{ type: 'state', states: { … } }`.
5. 이후 단계에는 partial 프레임(`full: false`와 `changed` 또는 `removed`)이나 accumulate 프레임을 yield합니다.
6. 끝나면 return합니다 — `done` 프레임은 없습니다. 사용자에게 메시지를 보여주려면 `TransitionError`를 throw합니다.
7. 페이지에서 실행합니다: 버튼이나 폼의 `data-action="search"`, client 컴포넌트의 `useAction(renew, 'search')`, 또는 로드 직후 실행되는 `<Boot transition="search" />`.
:::

## 최소 예시 {#example}

```ts label="✓ StateSurface — 3단계 UX, 순서는 스트림 하나가 보장"
// transitions/search.ts → "search": 스켈레톤 → 캐시 → 실시간
import { defineTransition } from 'state-surface/server';
import { searchCache, searchLive } from '../shared/search.server';

export default defineTransition({
  targets: ['search:summary', 'search:results'],
  async *handler(params, ctx) {
    const query = String(params.query ?? '');

    // 1. Full 프레임: 두 target의 기준 상태 — 로딩 스켈레톤
    yield {
      type: 'state',
      states: {
        'search:summary': { text: 'Searching…' },
        'search:results': { query, loading: true, items: [] },
      },
    };

    // 2. Partial 프레임: 캐시 결과 먼저, summary는 그대로
    const cached = await searchCache(query);
    yield {
      type: 'state',
      full: false,
      changed: ['search:results'],
      states: { 'search:results': { query, loading: false, items: cached, badge: 'cached' } },
    };

    // 3. Partial 프레임: 실시간 결과가 캐시를 대체하고 summary도 바뀜
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
    // `done` 프레임 없음: handler가 return하면 엔진이 보냄
  },
});
```

```tsx label="routes/search.tsx — 대상 슬롯과 transition을 실행하는 폼"
import { Slot } from 'state-surface';
import Layout from '../layouts/Layout';
import SearchSummary from './search/_components/SearchSummary';
import SearchResults from './search/_components/SearchResults';

export default async function Page() {
  return (
    <Layout title="Search">
      {/* 폼 필드가 params가 됨: { query: '…' } */}
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
**Invisible Power** — 추가 코드 없이 얻는 것들:

- ✓ yield 순서 = UX 타임라인: 스켈레톤 → 캐시 → 실시간, 스트림 하나가 구조적으로 보장합니다.
- ✓ 캐시 결과와 실시간 결과의 레이스가 없습니다 — 순서는 서버가 정합니다.
- ✓ 새 검색이 진행 중인 검색을 abort합니다. 서버는 generator를 멈추고 `ctx.signal`을 abort합니다.
- ✓ 실행 중에는 두 슬롯에 `data-pending`이, 첫 결과가 적용된 뒤 요청이 끝날 때까지는 `data-has-result`도 붙습니다.
- ✓ server 슬롯은 서버에서 렌더되므로 페이지가 이 컴포넌트들의 JavaScript를 보내지 않습니다.
:::

```tsx label="기존 방식 — 수동 비동기 조율, 버그 3개" collapsible
// React 방식 3단계 UX 검색
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

    // ⚠️ BUG: live가 cached보다 먼저 resolve되면 오래된 cached 결과가 live를 덮어씀
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
        // ⚠️ BUG: 에러가 조용히 삼켜짐 — 사용자는 계속 오래된 결과를 봄
        console.error(e);
      });

    return () => controller.abort();
    // ⚠️ BUG: 순서 보장 없음 — cached와 live가 서로 경쟁
  }, [query]);

  if (loading) return <Skeleton />;
  return <ResultList items={items} badge={badge} />;
}
```

## 프레임 옵션 {#frames}

transition이 yield하는 모든 프레임에는 `type: 'state'`와 `states`가 있습니다. `states`는 슬롯 이름을 각 슬롯 컴포넌트의 props에 대응시킵니다. 몇 가지 필드가 프레임 적용 방식을 정합니다.

- **Full** (기본값, `full` 생략) — transition target 전체의 완전한 상태입니다. 프레임에 없는 target은 제거되고, target 밖 슬롯과 정적 마크업은 그대로 남습니다. 모든 요청의 첫 프레임은 full이어야 합니다.
- **Partial** (`full: false`) — `changed`의 슬롯을 갱신하고 `removed`의 슬롯을 제거하며 나머지 target은 그대로 둡니다. `changed`, `removed`, `uiChanged` 중 하나 이상이 필요합니다. `changed`의 키는 `states`에 있어야 하고 `removed`의 키는 없어야 하며, 한 키가 양쪽에 있을 수 없습니다.
- **Accumulate** (`accumulate: true`) — `states`의 각 슬롯에 delta를 병합합니다: 배열은 concat, 문자열은 concat, 그 밖의 값은 교체. 첫 프레임이 될 수 없고 `removed`, `ui`, `reset`과 함께 쓸 수 없습니다.
- **`ui`와 `uiChanged`** — 내용을 다시 렌더하지 않고 `<h-state>` 요소 자체의 클래스와 CSS 변수를 바꿉니다.
- **`reset: ['slot']`** — client 슬롯을 다시 마운트해 로컬 상태를 처음부터 시작합니다. 예: 저장 후 폼 비우기. server 슬롯에는 쓸 수 없습니다.
- **단일 결과** — generator가 아닌 일반 `async` 함수 handler는 `{ states }`를 한 번 return합니다. 엔진은 이를 full 프레임 하나로 JSON 응답에 담아 보냅니다.

```ts label="하나의 transition에서 Full → accumulate → partial"
// transitions/deploy.ts → "deploy"
import { defineTransition } from 'state-surface/server';
import { runBuild } from '../shared/deploy.server';

export default defineTransition({
  targets: ['deploy:status', 'deploy:log', 'deploy:hint'],
  async *handler(params, ctx) {
    // Full: 세 target 모두의 기준 상태
    yield {
      type: 'state',
      states: {
        'deploy:status': { phase: 'building' },
        'deploy:log': { lines: [] },
        'deploy:hint': { text: 'This takes about a minute.' },
      },
    };

    // Accumulate: 줄마다 추가 (배열 concat)
    for await (const line of runBuild(String(params.branch), ctx.signal)) {
      yield { type: 'state', accumulate: true, states: { 'deploy:log': { lines: [line] } } };
    }

    // Partial: 새 status, hint 제거, log는 그대로
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

여러분은 슬롯 상태를 기술하고, 무엇을 전송할지는 엔진이 정합니다. server 슬롯(`mode="server"`)은 서버에서 렌더되어 HTML로 전송됩니다. client 슬롯(`client:*`)은 새 props를 받거나, accumulate 프레임이면 delta만 `merge` op로 받습니다. 프레임 하나는 최대 patch 하나가 되므로 함께 바뀐 슬롯은 함께 나타납니다 — 단, 직전 렌더 후 33ms 안에 다시 렌더되는 server 슬롯은 다음 patch로 뒤따릅니다.

:::callout{kind="note"}
슬롯 상태는 요청 하나 동안만 존재합니다. 모든 요청은 빈 상태에서 시작하고, 서버는 브라우저가 보낸 상태를 신뢰하지 않습니다 — 필요한 데이터는 데이터베이스에서 다시 읽으세요. 서버가 stateless이므로 인스턴스 하나든 여러 개든 Workers든 똑같이 동작합니다.
:::

:::callout{kind="tip"}
경험칙: 기준을 세우는 full 프레임, 선택적 갱신을 위한 partial 프레임, 자라나는 콘텐츠를 위한 accumulate 프레임. 스트리밍은 [Accumulate 가이드](/ko/guide/accumulate)에서, `ui`는 [UI Patch 가이드](/ko/guide/ui-patch)에서 자세히 다룹니다.
:::

## 옵션과 동시성 {#options}

`defineTransition`은 handler와 몇 가지 옵션을 받으며, 옵션은 모두 선택입니다. handler만 넘겨도 됩니다: `export default defineTransition(search)`.

- `targets` — 이 transition이 바꿀 수 있는 슬롯입니다. full 프레임은 정확히 이 슬롯들을 교체하고, 다른 슬롯을 건드리는 프레임은 실패합니다. 브라우저에서는 동시성을 결정합니다: 새 액션은 같은 이름의 실행 중 액션과 target이 겹치는 액션을 abort하고, target이 겹치지 않는 액션은 병렬로 실행됩니다.
- `targets`가 없으면 서버에서는 첫 full 프레임의 슬롯이 target이 되지만, 브라우저는 이를 미리 알 수 없습니다. 그래서 그 액션은 모든 슬롯과 겹친 것으로 취급되어 다른 모든 액션을 abort하고 다른 모든 액션에 abort됩니다. 개발 모드에서 한 번 경고합니다.
- `mode: 'queue'` — 이 transition의 요청들이 서로 abort하지 않고 차례대로 실행됩니다.
- `input` — params용 Standard Schema(zod, valibot, arktype 등)입니다. 잘못된 params는 handler에 도달하지 않습니다: 응답은 `kind: 'validation'`과 `fieldErrors`를 담은 422이며 에러 슬롯에 표시됩니다. 폼 본문은 먼저 객체로 바뀌고(반복된 이름은 배열), handler는 파싱되고 타입이 지정된 값을 받습니다.
- `flash: { input: ['body'] }` — JavaScript 없는 폼에 되돌려 줄 필드입니다. 모든 transition은 `<form method="post" action={actionUrl('comments/add')}>`로 쓸 수 있습니다: transition을 실행하고 303으로 되돌아가며, 다음 페이지는 `await ctx.flash('comments/add')`로 결과를 한 번 읽습니다. 나열한 필드는 그 `input`으로 돌아오므로(파일 제외) 에러 후 폼을 다시 채울 수 있습니다. JavaScript가 있으면 엔진이 같은 transition을 스트림으로 실행합니다.
- `viewTransition: true` — 액션의 첫 번째 화면 변화를 View Transition으로 감쌉니다.

```ts label="타입 있는 input, 선언한 targets, 순서대로 실행되는 요청"
// transitions/like.ts → "like"
import { z } from 'zod';
import { defineTransition } from 'state-surface/server';
import { addLike, countLikes } from '../shared/likes.server';

export default defineTransition({
  // 잘못된 params → 422 { kind: 'validation', fieldErrors }, handler는 실행되지 않음
  input: z.object({ postId: z.string(), delta: z.number().int().min(1).max(5) }),
  targets: ['post:likes'],
  mode: 'queue', // 빠른 클릭 세 번 → 요청 세 개가 차례대로 실행
  async *handler({ postId, delta }) {
    await addLike(postId, delta);
    yield { type: 'state', states: { 'post:likes': { count: await countLikes(postId) } } };
  },
});
```

:::callout{kind="tip"}
빌드가 `.state-surface/actions.d.ts`를 생성하므로 `useAction(renew, 'like')`와 `<Boot>`은 transition 이름과 params를 `input`에 맞춰 검사하고, `actionUrl()`은 이름을 검사합니다. 브라우저 쪽 — `data-action`, pending 표시, 결과 — 은 [Action 가이드](/ko/guide/action)에 있습니다.
:::

## 애니메이션 프리셋 {#animation}

`<Slot>`에 `data-animate`를 추가하면 — 호스트 속성은 `<h-state>` 요소에 그대로 쓰입니다 — 프레임이 그 슬롯을 갱신할 때마다 표시 애니메이션이 재생됩니다. 값으로 프리셋을 고르며, 각 프리셋은 그 슬롯을 대상으로 하는 요청이 진행 중일 때 슬롯을 흐리게 표시하기도 합니다.

- `fade` — 불투명도만 변경합니다. 값 없는 `data-animate`도 이렇게 동작합니다.
- `slide-up`, `slide-down`, `slide-left`, `slide-right` — 짧은 이동 + 페이드. 단계적으로 로드되는 콘텐츠에 적합합니다.
- `scale` — 약간 확대 + 페이드. 새 콘텐츠에 시선을 끕니다.
- `blur` — 흐릿한 상태에서 선명해집니다.
- `flip` — 짧은 3D 회전입니다.

```tsx label="슬롯에 프리셋 사용"
{/* 애니메이션 없음: 슬롯이 조용히 갱신됨 */}
<Slot name="search:summary" mode="server" component={SearchSummary} />

{/* 매 갱신마다 페이드 인 */}
<Slot name="search:results" mode="server" component={SearchResults} data-animate="fade" />

{/* 아래에서 슬라이드 업 */}
<Slot name="demo:timeline" mode="server" data-animate="slide-up">
  <DemoTimeline frames={[]} />
</Slot>
```

```css label="커스텀 프리셋 정의"
@keyframes h-state-rotate {
  from { opacity: 0; transform: rotate(-5deg); }
  to   { opacity: 1; transform: rotate(0); }
}
h-state[data-animate="rotate"][data-just-updated] {
  animation: h-state-rotate 0.3s ease-out;
}
```

:::callout{kind="info"}
애니메이션은 CSS로만 동작합니다. 엔진은 속성만 설정하고, 프리셋은 데모의 `client/styles.css`에 있는 평범한 CSS입니다(`demo` 템플릿에는 포함되며, 그 밖에는 `h-state[data-animate…]` 규칙을 자신의 `client/styles.css`에 복사하세요). 엔진은 슬롯에 새 콘텐츠를 적용할 때마다 `data-just-updated`를 설정하고(`animationend`에서 제거), 그 슬롯을 대상으로 하는 요청이 실행되는 동안 `data-pending`을 설정합니다. 커스텀 프리셋은 `h-state[data-animate="name"][data-just-updated]`만 타겟으로 하면 됩니다. `prefers-reduced-motion: reduce`이면 엔진은 `data-just-updated`를 설정하지 않고, 프리셋은 움직임 없이 대기 중 흐림 표시만 남깁니다.
:::

:::callout{kind="tip"}
두 상태 사이에서 요소를 모핑하려면 View Transition API를 선택하세요: `defineTransition`의 `viewTransition: true`, 액션 요소의 `data-view-transition`, 또는 `<Slot viewTransition>`. View Transition은 액션당 한 번 — 첫 patch에서, `<Slot viewTransition>`이면 그 슬롯을 바꾸는 첫 patch에서 — 실행되며, reduced motion이거나 API가 없으면 생략됩니다.
:::

## 실행 시퀀스 {#sequence}

:::sequence
1. `data-action` 클릭이나 제출, `useAction().run()` 또는 `<Boot>`가 params를 JSON(또는 폼 데이터)으로 담고 `X-Surface-Build`, `X-Surface-Page` 헤더와 함께 `/transition/search`에 POST합니다. 겹치는 실행 중 액션은 abort되고 target에 `data-pending`이 붙습니다.
2. 서버가 빌드를 확인하고(409면 페이지를 다시 로드) `input`을 검증합니다(422면 여기서 끝나고 handler는 실행되지 않음).
3. 첫 프레임은 full이며 모든 target(선언한 `targets`, 없으면 이 프레임의 슬롯)의 기준 상태를 정합니다. 요청 reducer가 이를 적용하고 각 target을 투영합니다: server 슬롯은 `html` op로 렌더되고 client 슬롯은 `props` op를 받으며, 모두 `reset: true`인 `patch` 하나에 담깁니다.
4. 이후 프레임은 각각 건드린 슬롯의 op만 담은 patch 하나가 됩니다: 제거된 슬롯은 `remove` op, client 슬롯의 accumulate delta는 `merge` op, server 슬롯 렌더는 33ms당 최대 한 번으로 묶입니다.
5. 브라우저는 NDJSON 줄이 도착하는 대로 읽고, 대기 중인 op를 애니메이션 프레임마다 한 번 합친 뒤 `<h-state>`별로 적용합니다. 첫 patch가 적용되면 target에 `data-has-result`가 붙습니다.
6. handler가 return하면 엔진이 `done`을 보내고 `data-pending`과 `data-has-result`가 지워집니다. handler가 throw하면 `error` 프레임이 `system:error` 슬롯을 렌더합니다.
:::

:::diagram{label="yield에서 DOM까지"}
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

## 흔한 실수 {#mistakes}

:::warning
모든 요청은 full 프레임으로 시작합니다. partial이나 accumulate 프레임을 먼저 보내는 것은 프로토콜 위반입니다: 요청은 error 프레임으로 끝나며, 그 메시지는 개발 모드에서 transition 이름과 프레임 번호를 담고(서버는 스택도 기록) 프로덕션에서는 `Transition failed`입니다.

yield할 `done`이나 `error` 프레임도 없습니다. 끝내려면 return, 실패하려면 throw하세요.
:::

:::checklist
- 파일이 `transitions/` 아래에 있고 액션 이름이 그 경로(`comments/add`)이며 kebab-case입니다.
- 첫 번째로 yield한 프레임이 full입니다(`full: false`도 `accumulate: true`도 없음).
- partial 프레임에 `full: false`와 `changed`, `removed`, `uiChanged` 중 하나 이상이 있습니다.
- `changed`의 키는 `states`에 있고 `removed`의 키는 없으며, 양쪽에 동시에 있는 키가 없습니다.
- 프레임이 건드리는 모든 슬롯이 `targets`에 있고, 현재 페이지에 있으며, static이 아닙니다.
- `yield { type: 'done' }`나 `yield { type: 'error' }`가 없습니다 — 끝내려면 return, 실패하려면 throw.
- 쿠키는 첫 `yield` 전에 설정합니다.
- 오래 걸리는 작업에 `ctx.signal`을 넘겨 abort된 요청이 작업을 멈추게 합니다.
:::

## 트러블슈팅 {#debug}

:::debug{symptom="요청이 frame #1에서 실패합니다: the first state frame must be a full frame." cause="첫 프레임이 partial(full: false)이나 accumulate입니다."}
첫 `yield`에서 `full: false`나 `accumulate: true`를 제거하세요 — full이 기본값입니다. 첫 프레임 이후의 프레임만 partial이나 accumulate가 될 수 있습니다.
:::

:::debug{symptom="프레임이 실패합니다: slot … is outside the transition targets." cause="슬롯이 targets에 없습니다. targets가 없다면 첫 full 프레임에 없었습니다."}
슬롯을 `targets`에 추가하거나 첫 full 프레임에 포함하세요. transition은 선언한 슬롯만 바꿀 수 있습니다.
:::

:::debug{symptom="프레임이 실패합니다: slot … is static and cannot be updated." cause="Slot에 server 모드도 client 지시자도 없어 한 번만 렌더됩니다."}
`<Slot>`에 `mode="server"`(서버 렌더 HTML)나 `client:*` 지시자(props)를 추가하세요.
:::

:::debug{symptom="이후 프레임이 도착하면 슬롯이 사라집니다." cause="이후 프레임이 full이고, full 프레임에 없는 target 슬롯은 제거됩니다."}
일부 target만 갱신하려면 partial 프레임(`full: false`와 `changed`)을 쓰거나, full 프레임에 모든 target을 다시 담으세요.
:::

:::debug{symptom="프로덕션에서 에러 슬롯에 내 메시지 대신 Transition failed가 보입니다." cause="일반 Error를 throw했습니다. 개발 모드 밖에서는 TransitionError 메시지만 사용자에게 전달됩니다."}
사용자가 봐도 되는 메시지는 `new TransitionError('…')`로 throw하세요. 레이아웃이 `system:error`를 server 또는 client 슬롯(`<Slot name="system:error" mode="server" component={…} />`)으로 렌더하는지도 확인하세요 — 없거나 static이면 아무것도 표시되지 않고 개발 모드에서 경고합니다.
:::

:::debug{symptom="버튼 하나를 누르면 관계없는 액션이 취소됩니다." cause="두 transition 중 하나가 targets를 선언하지 않아 모든 슬롯과 겹칩니다."}
두 transition 모두에 `targets`를 선언하세요. target이 겹치지 않는 액션은 병렬로 실행됩니다. 같은 transition의 요청을 순서대로 실행하려면 `mode: 'queue'`를 쓰세요.
:::

:::debug{symptom="handler에서 설정한 쿠키가 저장되지 않습니다." cause="응답 헤더가 이미 전송된 첫 yield 이후에 설정했습니다."}
쿠키는 첫 프레임 전에 설정하세요. 이후의 쓰기는 개발 모드에서 경고합니다.
:::

## 다음: 직접 실습 {#next}

[스트리밍 데모](/ko/examples/streaming)에서 transition 하나가 모든 종류의 프레임을 보내는 모습을 보세요: full 프레임이 데모 슬롯을 채우고, partial 프레임이 timeline과 output을 바꾸고, accumulate 프레임이 timeline에 항목을 추가하고, 또 다른 partial 프레임이 output을 제거하고, 마지막 full 프레임이 이를 되돌립니다. 에러 버튼은 `TransitionError`를 throw합니다. 이어서 [Accumulate 가이드](/ko/guide/accumulate)에서 client 슬롯으로 토큰을 스트리밍하는 법을 읽어보세요.
