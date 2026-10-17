---
title: Surface
order: 2
demoHref: /examples/streaming
demoLabel: 스트리밍 데모
---

## TL;DR {#tldr}

Surface는 페이지 그 자체입니다. `routes/**/*.tsx`의 `export default async function Page(ctx)`가 문서 전체를 JSX로 반환합니다. 페이지가 로드된 뒤 바뀔 수 있는 영역은 `<Slot name="ns:name">`으로 감쌉니다 — 설계도에 “여기에 콘텐츠”라고 표시하는 것과 같습니다. 슬롯 바깥은 방문하는 동안 변하지 않는 일반 서버 마크업이고, 슬롯 안의 내용만 갱신됩니다.

## 비유로 이해하기 {#analogy}

:::analogy
Surface = 인테리어 전의 건물 뼈대 공사. 방 배치를 정하고 벽에 콘센트 구멍을 뚫어 둡니다. 각 `<Slot>`은 이름표(`stock:price`)가 붙은 콘센트입니다. Template은 나중에 꽂는 가전제품이고, Transition은 콘센트를 이름으로 찾아갑니다. 벽은 움직이지 않고, 꽂힌 제품은 언제든 바뀔 수 있습니다.
:::

왜 “Surface”일까요? 페이지의 눈에 보이는 표면 — 화면을 그리는 JavaScript 번들이 아니라, 이름 붙은 경계를 가진 실제 HTML 표면을 뜻합니다. 페이지 함수 본문은 요청마다 실행되는 서버 스크립트이고(데이터는 여기서 await합니다), 반환하는 JSX가 마크업입니다. Transition은 페이지 함수를 다시 실행하지 않고 슬롯에 새 상태만 보냅니다.

:::callout{kind="note"}
`async`는 페이지 함수에만 쓸 수 있습니다. 레이아웃과 컴포넌트는 동기로 렌더링되며, Promise를 반환하는 컴포넌트는 SSR 오류입니다. 데이터는 페이지 본문에서 await해 props로 내려주거나, server 슬롯의 자식을 `load` 단계가 있는 `defineServerComponent`로 만드세요.
:::

## 언제 사용하나 {#when}

- Slot 없는 페이지 마크업: 레이아웃, 내비게이션, 제목, 푸터 — 사용자가 페이지에 머무는 동안 변하지 않는 모든 것. 서버 HTML일 뿐이며 JavaScript를 보내지 않습니다.
- `mode="server"`: transition이 바꾸는 콘텐츠의 기본 선택입니다. 서버가 컴포넌트를 다시 렌더링해 HTML을 보내고, `swap="morph"`는 입력값과 포커스를 유지합니다.
- `client:load`, `client:idle`, `client:visible`, `client:media="(…)"`, `client:only`: 브라우저에서 hydrate되어 로컬 상태를 유지하고 props를 받는 Lithent 컴포넌트입니다. 브라우저 상태나 API가 필요한 영역에만 사용하세요.
- mode도 지시자도 없으면 **static**입니다. 한 번만 렌더링되는 이름 붙은 영역이며 프레임으로 바꿀 수 없습니다.
- `fallback`과 함께 쓰는 `server:defer`는 느린 server 슬롯을 페이지 이후에 불러옵니다. `capability="rich"` 또는 `capability="unsafe"`는 슬롯 안에서 Markdown이나 raw HTML을 허용합니다(기본은 strict).
- 페이지 옵션은 named export입니다: `plugins`(Template 가이드 참고), 정적 HTML을 위한 `prerender`와 `getStaticPaths`.

## 단계별 구현 {#steps}

:::sequence
1. `routes/dashboard.tsx`를 만듭니다. 파일 경로가 곧 URL(`/dashboard`)입니다. `[id].tsx` 세그먼트는 `ctx.params`가 되고, `_`로 시작하는 파일과 폴더는 페이지가 아닙니다.
2. `async function Page(ctx: SurfaceContext)`를 default export하고 첫 화면에 필요한 데이터(`ctx.params`, `ctx.url`, 데이터베이스)를 await합니다.
3. `<html>`, `<head>`, `<body>`를 렌더링하는 `layouts/Layout.tsx` 같은 레이아웃으로 문서를 반환합니다. doctype, 스타일시트, bootstrap JSON, 스크립트는 엔진이 추가합니다.
4. 바뀔 수 있는 영역마다 `<Slot name="ns:name">`으로 감싸고, import한 컴포넌트 엘리먼트 정확히 하나를 자식으로 둡니다. 그 엘리먼트의 props가 초기 슬롯 상태입니다. 처음에 비어 있는 슬롯은 `component={X}`를 씁니다.
5. 슬롯마다 모드를 고릅니다: `mode="server"`, `client:*` 지시자, 또는 정적 콘텐츠라면 아무것도 붙이지 않습니다.
6. 로드 직후 데이터를 스트리밍하려면 `<Boot transition="…" />`를 두거나 템플릿에 액션을 연결하고, 이 슬롯 이름들로 `states`를 보내는 transition을 작성합니다.
:::

```tsx label="layouts/Layout.tsx — 문서 셸"
import { Slot } from 'state-surface';
import SystemError from '../routes/_shared/components/systemError.js';

// 동기 컴포넌트: 데이터는 props로, 페이지 콘텐츠는 children으로 받습니다.
export default function Layout(
  { title }: { title: string; children?: unknown },
  children: unknown
) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        {/* 선택: 여기에 <ClientRouter />를 두면 페이지 간 링크가 클라이언트 내비게이션이 됩니다. */}
      </head>
      <body class="min-h-screen bg-slate-100 text-slate-900">
        {children}
        {/* error 프레임은 { message } props로 여기에 렌더링됩니다. */}
        <Slot name="system:error" mode="server" component={SystemError} />
      </body>
    </html>
  );
}
```

## 최소 예시 {#example}

```tsx label="✓ StateSurface — 25줄"
// routes/dashboard.tsx — GET /dashboard, 독립적으로 갱신되는 3개 패널
import type { SurfaceContext } from 'state-surface/server';
import { Boot, Slot } from 'state-surface';
import Layout from '../layouts/Layout.js';
import StockPrice from './dashboard/_components/stockPrice.js';
import StockNews from './dashboard/_components/stockNews.js';
import StockChart from './dashboard/_components/stockChart.js';

export default async function Page(ctx: SurfaceContext) {
  const symbol = ctx.url.searchParams.get('symbol') ?? 'AAPL';
  return (
    <Layout title="Stock Dashboard">
      <main class="mx-auto grid max-w-6xl grid-cols-3 gap-4 p-6">
        <Slot name="stock:price" mode="server">
          <StockPrice symbol={symbol} price={0} change={0} loading />
        </Slot>
        <Slot name="stock:news" mode="server" component={StockNews} />
        <Slot name="stock:chart" client:visible>
          <StockChart symbol={symbol} points={[]} />
        </Slot>
        <Boot transition="dashboard-load" params={{ symbol }} />
      </main>
    </Layout>
  );
}
```

:::callout{kind="info"}
**Invisible Power** — 이 코드가 자동으로 처리하는 것들:

- ✓ 각 패널이 독립된 갱신 경계 — `stock:price` 프레임은 뉴스나 차트를 절대 re-render하지 않음
- ✓ 패널 추가 = `<Slot>` 하나 + 컴포넌트 파일 하나
- ✓ 슬롯 바깥 마크업은 서버 HTML뿐 — JavaScript도 hydration도 없음
- ✓ server 슬롯은 컴포넌트 코드를 보내지 않음, `stock:chart`만 화면에 들어올 때 자기 청크(와 Lithent)를 로드
- ✓ `<Boot>`가 첫 화면 직후 실제 데이터를 스트리밍 — 클라이언트 fetch 코드 불필요
:::

```tsx label="기존 방식 — 33줄, 수동 상태 관리 + 연쇄 re-render" collapsible
// React 방식 대시보드 — 각 패널이 자체 데이터를 관리
import { useState, useEffect } from 'react';
import { StockPrice } from './StockPrice';
import { StockNews } from './StockNews';
import { StockChart } from './StockChart';

function Dashboard() {
  const [priceData, setPriceData] = useState(null);
  const [newsData, setNewsData] = useState(null);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetchPrice().then(setPriceData);
  }, []);
  useEffect(() => {
    fetchNews().then(setNewsData);
  }, []);
  useEffect(() => {
    fetchChart().then(setChartData);
    // ⚠️ BUG: cleanup 없음 — unmount 후 stale setState 호출
  }, []);

  // ⚠️ BUG: 자식 state 변경 시 부모가 re-render
  // price만 갱신돼도 3개 패널 전부 re-render
  return (
    <div className="grid grid-cols-3 gap-4">
      <StockPrice data={priceData} loading={!priceData} />
      <StockNews data={newsData} loading={!newsData} />
      <StockChart data={chartData} loading={!chartData} />
    </div>
  );
}
// + 자체 fetch 로직이 있는 자식 컴포넌트 파일 3개
```

## 두 가지 레이아웃 패턴 {#mixed}

`<Slot>`은 평범한 JSX 엘리먼트입니다. 페이지나 레이아웃 마크업 어디에나 둘 수 있습니다 — 정적 제목 사이, 섹션 안, 나란히. 슬롯은 중첩할 수 없고, 슬롯 이름은 레이아웃을 포함한 페이지 안에서 고유해야 합니다. transition이 갱신하지 않는 client 컴포넌트에는 Slot이 필요 없습니다. 컴포넌트에 지시자를 직접 붙이면 아일랜드가 됩니다.

```tsx label="패턴 A — server 슬롯을 둘러싼 정적 마크업"
<main class="flex flex-col gap-8">
  <Slot name="page:hero" mode="server">
    <PageHero title={hero.title} description={hero.description} />
  </Slot>
  <section class="border-t border-slate-200 pt-8">
    <h2 class="text-lg font-semibold">Core Concepts</h2>
    <Slot name="page:concepts" mode="server">
      <PageConcepts concepts={concepts} />
    </Slot>
  </section>
</main>
```

```tsx label="패턴 B — 한 페이지의 server 슬롯, client 슬롯, 아일랜드"
<main class="flex flex-col gap-4">
  {/* server 슬롯: transition은 props를 보내고, 브라우저는 HTML을 받습니다 */}
  <Slot name="chat:messages" mode="server">
    <ChatMessages messages={messages} />
  </Slot>
  {/* client 슬롯: 비어 있는 상태로 시작해 props와 merge delta를 받습니다 */}
  <Slot name="chat:current" client:load component={ChatCurrent} />
  {/* 아일랜드: 슬롯 이름이 없는 client 컴포넌트, transition 대상이 아닙니다 */}
  <LikeButton client:idle count={likes} />
</main>
```

:::callout{kind="tip"}
기본은 패턴 A입니다. 정적 제목, 구분선, 장식 요소는 HTML에 포함되어 절대 재렌더링되지 않고, server 슬롯은 컴포넌트 코드를 보내지 않습니다. 패턴 B의 client 슬롯이나 아일랜드는 로컬 상태나 브라우저 API가 필요한 곳에만 쓰세요. server 슬롯 안에 둔 아일랜드는 그 슬롯이 다시 렌더링될 때마다 새로 만들어집니다.
:::

## 실행 시퀀스 {#sequence}

:::sequence
1. `GET /dashboard` — 서버가 `routes/dashboard.tsx`를 찾고 미들웨어를 실행합니다.
2. 페이지 함수가 `ctx`와 함께 실행되어 트리를 반환하고, 엔진이 그 안의 Slot, 아일랜드, `<Boot>`를 수집합니다.
3. 페이지에 있는 server 컴포넌트의 `load` 단계를 병렬로 기다린 뒤, 트리를 HTML로 렌더링합니다. 각 슬롯은 `<h-state name="…">` 호스트 안에 들어갑니다.
4. 엔진이 doctype, 스타일시트, `__SURFACE__` bootstrap JSON을 추가하고 — 페이지에 필요할 때만 — 엔진 스크립트를 추가합니다.
5. 브라우저가 완성된 페이지를 표시합니다(MPA). client 슬롯은 각자의 시점에 snapshot props로 hydrate되고, 지연 슬롯을 가져오며, `<Boot>` transition이 시작됩니다.
:::

## 흔한 실수 {#mistakes}

:::warning
2.0에서 가장 흔한 실수: `mode`나 `client:*` 지시자가 없는 `<Slot>`은 **static**입니다. 한 번만 렌더링되고, 이 슬롯을 대상으로 하는 transition은 `slot "stock:price" is static and cannot be updated` 오류로 실패합니다.

두 번째로 흔한 실수는 변하는 콘텐츠를 페이지 마크업에 하드코딩하는 것입니다. 사용자가 페이지에 머무는 동안 바뀔 수 있는 것은 모두 Slot 안에 있어야 합니다.
:::

:::checklist
- transition이 바꾸는 모든 영역이 `mode="server"` 또는 `client:*` 지시자가 있는 `<Slot>`입니다.
- 각 `<Slot>`의 자식은 정적으로 import한 컴포넌트 엘리먼트 정확히 하나(또는 `component={X}`)이고, 그 엘리먼트에는 JSX children이 없습니다.
- 슬롯 이름이 `ns:name` 형식(`[a-z0-9-]+(:[a-z0-9-]+)*`)이며 페이지와 레이아웃 전체에서 고유합니다.
- transition이 슬롯 이름을 `states` 키로 쓰고, 자식 컴포넌트의 props 모양을 보냅니다.
- 비동기 작업은 페이지 함수나 server 컴포넌트의 `load`에서만 하고, 컴포넌트에서는 하지 않습니다.
- 레이아웃이 `<html>`, `<head>`, `<body>`를 각각 정확히 한 번 렌더링합니다.
:::

## 디버깅 체크리스트 {#debug}

:::debug{symptom="빌드가 “needs exactly one component element as its child” 오류로 실패합니다." cause="Slot이 텍스트, Fragment, 조건식 또는 여러 엘리먼트를 감싸고 있습니다."}
그 마크업을 컴포넌트 하나로 옮기고 데이터는 props로 넘기세요. 조건식은 컴포넌트 안에 둡니다. 처음에 비어 있는 슬롯은 자식 대신 `component={X}`를 쓰세요.
:::

:::debug{symptom="액션이 “slot … is static and cannot be updated” 또는 “is not on page” 오류로 실패합니다." cause="Slot에 mode가 없거나, 이름이 states 키와 다르거나, 액션을 실행한 페이지가 그 슬롯을 렌더링하지 않습니다."}
`mode="server"`나 client 지시자를 추가하고, 이름을 콜론까지 한 글자씩 비교하고, 페이지가 그 슬롯을 렌더링하는지 확인하세요. 개발 모드 오류 메시지에 transition 이름, 프레임 번호, 슬롯이 나옵니다.
:::

:::debug{symptom="SSR이 “… returned a Promise” 오류로 실패합니다." cause="async 컴포넌트입니다. 컴포넌트는 동기로 렌더링되므로 Promise는 아무것도 렌더링하지 않습니다."}
데이터는 페이지 함수에서 await해 props로 내려주거나, 컴포넌트를 `mode="server"` Slot 안의 `defineServerComponent({ load, render })`로 바꾸세요.
:::

:::debug{symptom="첫 로드 때 슬롯이 비어 있습니다." cause="자식 없이 component prop으로 선언되어 첫 프레임 전까지 비어 있거나, client only 슬롯이라 fallback을 표시하는 중입니다."}
의도된 동작입니다. 첫 화면이 필요하면 초기 props를 가진 자식 엘리먼트를 Slot에 두거나, 로드 직후 슬롯을 채우는 `<Boot>` transition을 시작하세요.
:::

## 다음: 직접 실습 {#next}

[스트리밍 데모](/ko/examples/streaming)에서 세 개의 슬롯이 독립적으로 갱신되는 모습을 실시간으로 확인하세요 — full 프레임은 모든 대상 슬롯을 교체하고, partial 프레임은 변경된 슬롯만 패치합니다. 이어서 [Template 가이드](/ko/guide/template)에서 슬롯 안에 들어가는 것을 알아보세요.
