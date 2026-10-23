---
title: Template
order: 3
demoHref: /examples/actions
demoLabel: 액션 플레이그라운드
---

## TL;DR {#tldr}

Template은 `<Slot>` 안에 들어가는 컴포넌트입니다. 그 props가 **곧** 슬롯 상태입니다. 페이지가 첫 props를 넘기고, transition은 `states['slot:name']`으로 새 props를 보냅니다. 데이터를 직접 가져오거나 서버 상태를 관리하지 않고, 받은 것을 그릴 뿐입니다. server 슬롯에서는 갱신마다 서버에서 실행되고, client 슬롯에서는 서버에서 한 번 렌더링된 뒤(`client:only` 제외) 브라우저에서 Lithent로 hydration·갱신됩니다.

## 비유로 이해하기 {#analogy}

:::analogy
Template = TV 화면. 리모컨(Action)이 채널을 고르면, 방송국(Transition)이 신호를 보내고, TV 화면(Template)은 도착한 신호를 그대로 보여줍니다. 화면은 스스로 아무것도 저장하지 않습니다. 신호가 바뀌면 화면이 바뀝니다.
:::

props를 컴포넌트가 아니라 서버가 결정하는 React 컴포넌트라고 생각하세요. 서버 데이터를 위한 `useState`도, fetch를 위한 `useEffect`도, context provider도 없습니다. 페이지 렌더, 모든 transition 갱신, 지연 슬롯이 같은 함수를 props와 함께 호출하고, 출력 형태만 다릅니다 — server 슬롯은 HTML, client 슬롯은 DOM diff입니다.

:::callout{kind="tip"}
loading prop 패턴: transition의 첫 프레임이 `{ loading: true }`를 보내면 skeleton을 표시하고, 다음 프레임에 실제 데이터를 보내세요. 서버가 로딩 UX 타이밍을 완전히 제어합니다.
:::

## 언제 사용하나 {#when}

- 모든 `<Slot>`에 하나씩 있습니다: 자식 엘리먼트, 또는 빈 슬롯의 `component={X}`.
- 기본은 평범한 동기 함수형 컴포넌트입니다. `mode="server"` 슬롯에서는 그 코드가 브라우저로 전혀 가지 않습니다.
- Template이 데이터를 직접 조회해야 하면 `state-surface/server`의 `defineServerComponent({ load, render })`를 씁니다. 슬롯 상태는 `load`의 입력(id, 종목 코드)이고 `render`는 그 결과를 받습니다.
- 로컬 상태, 브라우저 API, `useAction`이 필요할 때만 `client:*` 슬롯이나 아일랜드에 Lithent `mount` 컴포넌트를 씁니다.
- 서버 구동 데이터를 로컬 상태에 복사하지 마세요 — props를 읽으세요. 절대 변하지 않는 콘텐츠는 페이지 마크업에 둡니다.

## 단계별 구현 {#steps}

:::sequence
1. `routes/dashboard/_components/stockPrice.tsx`를 만듭니다 — `_`로 시작하는 폴더는 페이지가 아닙니다.
2. `Props` 타입을 정의합니다. 페이지가 넘기고 transition이 `states['stock:price']`로 보내는 모양입니다.
3. props만으로 렌더링하는 동기 함수형 컴포넌트를 작성하고 default export합니다.
4. 페이지에서 정적으로 import해 `<Slot name="stock:price" mode="server">`의 유일한 자식으로 둡니다. 고정 문구는 JSX children이 아니라 props로 넘깁니다.
5. transition에서 같은 모양을 보냅니다: `yield { type: 'state', states: { 'stock:price': { … } } }`.
6. 로컬 상태나 브라우저 API가 필요하면 Lithent `mount`로 작성하고, Slot에 `mode="server"` 대신 `client:*` 지시자를 붙입니다.
:::

## 최소 예시 {#example}

```tsx label="✓ StateSurface — 16줄"
// routes/dashboard/_components/stockPrice.tsx — <Slot name="stock:price" mode="server">의 자식
type Props = { symbol: string; price: number; change: number; loading?: boolean };

export default function StockPrice({ symbol, price, change, loading }: Props) {
  if (loading) return <div class="h-20 animate-pulse rounded-xl bg-slate-100" />;
  return (
    <div class="rounded-xl border p-4">
      <span class="text-sm text-slate-500">{symbol}</span>
      <p class="text-2xl font-bold">${price.toFixed(2)}</p>
      <span class={change > 0 ? 'text-green-600' : 'text-red-600'}>
        {change > 0 ? '+' : ''}
        {change.toFixed(2)}%
      </span>
    </div>
  );
}
```

:::callout{kind="info"}
**Invisible Power** — 이 무상태 함수가 공짜로 얻는 것들:

- ✓ `useState` 없음 — 서버가 상태 프레임으로 데이터를 전송
- ✓ `useEffect` 없음 — 클라이언트 fetch 불필요
- ✓ `AbortController` 없음 — 엔진이 겹치는 요청을 자동 abort
- ✓ 페이지 SSR과 모든 transition 갱신이 같은 함수를 호출, server 슬롯에서는 JavaScript 0
- ✓ `stock:price`에 새 상태가 올 때만 re-render
:::

```tsx label="기존 방식 — 43줄, 수동 fetch + 생명주기 관리" collapsible
// React 방식 주가 컴포넌트
import { useState, useEffect, useRef } from 'react';

function StockPrice({ symbol }: { symbol: string }) {
  const [data, setData] = useState<{ price: number; change: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    fetch(`/api/stock/${symbol}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => {
        if (e.name === 'AbortError') return;
        // ⚠️ 데이터 컴포넌트마다 이 fetch·abort·로딩·에러 처리를 반복
        setError(e.message);
        setLoading(false);
      });

    return () => controller.abort();
    // ⚠️ cleanup이나 AbortError 검사를 빠뜨리면 빠른 전환 시 이전 데이터나 에러가 보임
  }, [symbol]);

  if (loading) return <div className="animate-pulse h-20 bg-slate-100 rounded-xl" />;
  if (error) return <div className="text-red-600">{error}</div>;
  // ⚠️ 게다가 이 컴포넌트와 맞춰 유지할 /api/stock 엔드포인트도 필요
  return (
    <div className="rounded-xl border p-4">
      <span className="text-sm text-slate-500">{symbol}</span>
      <p className="text-2xl font-bold">${data!.price.toFixed(2)}</p>
      <span className={data!.change > 0 ? 'text-green-600' : 'text-red-600'}>
        {data!.change > 0 ? '+' : ''}{data!.change.toFixed(2)}%
      </span>
    </div>
  );
}
```

```tsx label="Server 컴포넌트 — 슬롯 상태가 곧 load 입력"
// routes/dashboard/_components/stockNews.tsx — <Slot name="stock:news" mode="server">의 자식
// transition은 load 입력을 보냅니다: states: { 'stock:news': { symbol: 'AAPL' } }
import { defineServerComponent, type SurfaceContext } from 'state-surface/server';
import { latestNews, type NewsItem } from '../../../shared/news.server.js';

type NewsData = { items: NewsItem[] };

const StockNews = defineServerComponent({
  // 슬롯을 렌더링할 때마다 다시 실행되며 ctx.signal로 취소됩니다.
  load: async ({ symbol }: { symbol: string }, ctx: SurfaceContext): Promise<NewsData> => ({
    items: await latestNews(symbol, ctx.signal),
  }),
  render: ({ items }: NewsData) => (
    <ul class="space-y-2">
      {items.map(item => (
        <li key={item.id}>
          <a href={item.url}>{item.title}</a>
        </li>
      ))}
    </ul>
  ),
});

export default StockNews;
```

```tsx label="Client 컴포넌트 — 로컬 상태, 최신 props, useAction"
// routes/dashboard/_components/stockChart.tsx — <Slot name="stock:chart" client:visible>의 자식
import { mount } from 'lithent';
import { useAction } from 'state-surface/client';
import Sparkline from './sparkline.js';

type Props = { symbol: string; points: number[] };

const StockChart = mount<Props>((renew, props) => {
  let expanded = false; // 로컬 상태: props 갱신에도 유지됩니다
  const refresh = useAction(renew, 'dashboard-load');
  const toggle = () => {
    expanded = !expanded;
    renew();
  };
  // props는 렌더 함수 안에서 읽으세요: props.points는 항상 최신 값입니다.
  return () => (
    <figure class={expanded ? 'h-96' : 'h-40'}>
      <Sparkline points={props.points} />
      <button type="button" onClick={toggle}>
        {expanded ? 'Collapse' : 'Expand'}
      </button>
      <button
        type="button"
        disabled={refresh.pending}
        onClick={() => void refresh.run({ symbol: props.symbol })}
      >
        {refresh.pending ? 'Refreshing…' : 'Refresh'}
      </button>
    </figure>
  );
});

export default StockChart;
```

## 실행 시퀀스 {#sequence}

:::sequence
1. transition이 `{ type: 'state', states: { 'stock:price': { symbol, price, change } } }`를 yield합니다.
2. 서버의 요청 reducer가 프레임을 적용하고, transition의 targets와 페이지의 슬롯 기준으로 검사합니다.
3. server 슬롯: 엔진이 (server 컴포넌트라면) `load`를 실행하고 슬롯의 capability로 템플릿을 HTML로 렌더링해 `html` op로 보냅니다. client 슬롯: props를 `props` op로, accumulate 프레임이면 `merge`로 보냅니다.
4. 브라우저가 애니메이션 프레임마다 op를 한 번씩 합쳐 `<h-state name="stock:price">` 안에 적용합니다: HTML 교체(`replace` 또는 `morph`) 또는 마운트된 인스턴스의 Lithent diff.
5. 플러그인이 `attach` 또는 `update`를 받고, 요청이 끝나면 슬롯의 `data-pending` 표시가 해제됩니다.
:::

:::callout{kind="info"}
full·partial 프레임은 슬롯의 props를 교체하고, accumulate 프레임은 delta를 병합합니다(배열과 문자열은 이어 붙이고, 나머지 값은 교체). 이 옵션들은 transition이 제어합니다 — 자세한 내용은 [Transition 가이드](/ko/guide/transition)를 참고하세요.
:::

## 흔한 실수 {#mistakes}

:::warning
슬롯 props는 병합되지 않고 교체됩니다. 모든 요청은 빈 상태에서 시작하고 서버는 페이지가 렌더링한 props를 모르므로, 프레임은 슬롯의 props 객체 전체를 보내야 합니다 — `{ price }`만이 아니라 `{ symbol, price, change }`. accumulate 프레임은 스트리밍 텍스트 같은 진짜 delta에만 쓰세요.
:::

:::checklist
- 컴포넌트가 정적으로 import되어 `<Slot>`의 유일한 자식(또는 `component={X}`)이고, JSX children이 없습니다.
- `Props` 타입이 페이지가 넘기는 값, transition이 슬롯 이름으로 보내는 값과 일치합니다.
- 동기로 렌더링합니다. 비동기 데이터는 페이지 함수나 server 컴포넌트의 `load`에 있습니다.
- 리스트는 안정적인 `key`를 사용합니다.
- 서버 구동 데이터를 로컬 상태에 두지 않고, client 컴포넌트는 렌더 함수 안에서 `props.x`를 읽습니다.
- client 컴포넌트는 빈 텍스트를 `''`가 아니라 `null`로 렌더링합니다.
- client 슬롯과 아일랜드의 props는 순수 JSON 값입니다 — `__SURFACE__`에 기록됩니다.
:::

## 디버깅 체크리스트 {#debug}

:::debug{symptom="액션 후에도 슬롯이 이전 내용 그대로이거나, 오류 슬롯에 프레임 오류가 표시됩니다." cause="states 키가 Slot 이름과 다르거나, Slot이 static이거나, 슬롯이 transition targets 밖에 있습니다."}
`<Slot name>`의 이름을 복사해 `states`에 쓰고, Slot에 `mode="server"`나 `client:*` 지시자를 붙이고, 이름을 `targets`에 추가하세요. 페이지를 `?debug=1`로 열면 요청마다 받은·적용된·버려진 op를 볼 수 있습니다.
:::

:::debug{symptom="첫 로드에서는 잘 보이지만 transition 후 일부 필드가 사라집니다." cause="프레임이 props 일부만 보냅니다. 슬롯 상태는 페이지가 렌더링한 값과 병합되지 않고 교체됩니다."}
props 객체 전체를 보내고, `Props` 타입을 transition의 `states`와 맞춰 두세요. server 컴포넌트에는 렌더링된 데이터가 아니라 `load` 입력(`{ symbol }`)을 보냅니다.
:::

:::debug{symptom="client 컴포넌트가 오래된 값을 보여주거나, 빈 텍스트가 hydration 후에 채워지지 않습니다." cause="mount 콜백에서 props를 한 번 구조 분해했거나, 첫 렌더에서 빈 문자열을 출력했습니다."}
mount 시점에 구조 분해하지 말고 반환한 렌더 함수 안에서 `props.x`를 읽으세요. `''` 대신 `null`을 렌더링하세요 — Lithent hydration은 비어 있는 SSR 텍스트 노드를 나중에 채우지 못합니다. 브라우저 전용 값(`window`, `Date.now()`)은 첫 렌더에서 빼고 이벤트 핸들러나 `mountCallback`에서 다루세요.
:::

:::debug{symptom="빌드가 defineServerComponent 템플릿을 거부합니다." cause="server Slot 밖에서 쓰였습니다 — client Slot의 자식, 아일랜드, 또는 일반 마크업 안."}
`<Slot mode="server">`의 자식(또는 `component`)만 server 컴포넌트가 될 수 있습니다. 브라우저용이라면 일반 컴포넌트를 작성하고 데이터를 props로 보내세요.
:::

## 범위 CSS {#styles}

일반 스타일은 마크업의 유틸리티로 쓰고, 유틸리티로 표현하기 어려운 것(container query, 복잡한 선택자, keyframes)은 컴포넌트 옆 `*.module.css` 파일에 씁니다. 클래스 이름이 파일마다 해시되므로 컴포넌트가 쓴 곳에만 적용되고, 전역은 `:global()`로 명시합니다. 페이지에 필요한 CSS는 빌드가 연결합니다. static·server 컴포넌트의 CSS Modules는 `<head>`의 페이지 스타일시트로, 아일랜드의 CSS는 청크와 함께 활성화 전에 연결되며, 클라이언트 이동은 다음 페이지의 스타일시트를 교체 전에 불러옵니다. SSR·server HTML 교체·client 렌더가 같은 모듈을 import하므로 클래스 이름이 항상 일치합니다.

```tsx label="✓ Card.tsx — 유틸리티와 CSS Module"
import s from './Card.module.css';

export default function Card({ title }: { title: string }) {
  return (
    <section class={`${s.card} rounded-lg p-4`}>
      <div class={s.body}>{title}</div>
    </section>
  );
}
```

```css label="Card.module.css — @apply는 앱 CSS를 @reference로 참조(이 파일 기준 상대 경로)"
/* routes/dashboard/_components/Card.module.css */
@reference "../../../client/styles.css";

.card {
  container-type: inline-size;
  @apply shadow-sm;
}

/* 컨테이너 쿼리는 자기 자신이 아니라 조상을 기준으로 함: 자식을 배치 */
@container (min-width: 32rem) {
  .body {
    @apply grid grid-cols-2 gap-4;
  }
}
```

:::callout{kind="tip"}
`@apply`는 모듈에 함께 있어야 할 스타일에만 쓰고, 단순한 스타일은 마크업 유틸리티로 둡니다. 가이드 페이지의 Markdown 본문도 이 방식으로 꾸밉니다(`routes/[lang]/guide/_components/guideProse.module.css`).
:::

## 플러그인 패턴 {#plugins}

플러그인은 슬롯이 렌더링된 뒤 브라우저에서만 할 수 있는 DOM 작업을 담당합니다 — 스크롤 위치, 관찰자, 포커스, 서드파티 위젯처럼 템플릿으로 표현할 수 없는 것들입니다. `state-surface/client`의 `definePlugin`으로 정의하고 페이지(또는 레이아웃)에서 `export const plugins = [...]`로 선언하면, 선언한 페이지만 그 청크를 로드합니다. `attach(el, info)`는 슬롯 DOM이 준비될 때(SSR 표시, client 활성화, 매 `swap="replace"`) 호출되고 cleanup을 반환할 수 있습니다. `update(el, info)`는 같은 DOM이 바뀌었을 때(`swap="morph"`, client props) 호출됩니다. `onPage`와 `onAction`은 페이지 수준 이벤트를 받습니다.

:::warning
안티패턴: `attach`나 `update` 안에서 상태 결정, 네트워크 호출, transition 시작을 절대 하지 마세요. 플러그인은 슬롯 DOM을 관찰하고 보강할 뿐 — 구동하지도, 구조를 바꾸지도, Lithent가 소유한 client 아일랜드 내부를 건드리지도 않습니다. 상태 로직은 transition에, 렌더링은 template에 남겨두세요.
:::

```ts label="✓ chatScroll — client/plugins/chatScroll.ts"
import { definePlugin } from 'state-surface/client';

export const chatScroll = definePlugin({
  name: 'chat-scroll',
  slots: ['chat:messages'], // 빌드가 읽는 리터럴, 생략하면 페이지의 모든 슬롯
  load: 'load', // 'load' | 'idle' (기본) | 'visible'
  attach(el) {
    el.scrollTop = el.scrollHeight; // 슬롯 DOM 준비: SSR, 활성화, replace
  },
  update(el) {
    el.scrollTop = el.scrollHeight; // 같은 DOM이 바뀜: morph, client props
  },
});
```

```ts label="✓ tocHighlight — 관찰자를 정리하는 cleanup"
import { definePlugin } from 'state-surface/client';

export const tocHighlight = definePlugin({
  name: 'toc-highlight',
  slots: ['guide:toc'],
  attach(el) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const link = el.querySelector(`a[href="#${entry.target.id}"]`);
        link?.toggleAttribute('data-active', entry.isIntersecting);
      }
    });
    for (const link of el.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const section = document.getElementById(link.hash.slice(1));
      if (section) observer.observe(section);
    }
    return () => observer.disconnect(); // 이 DOM이 교체·제거되기 직전에 실행됩니다
  },
});
```

```tsx label="✓ 페이지에 플러그인 선언"
// routes/chat.tsx — 플러그인을 선언한 페이지(또는 선언한 레이아웃을 쓰는 페이지)만 로드합니다
import { chatScroll } from '../client/plugins/chatScroll.js';

export const plugins = [chatScroll];
```

:::callout{kind="tip"}
판단 기준 — CSS-only: 셀렉터로 처리할 수 있을 때(`data-animate` 프리셋, `h-state[data-pending]` 스타일). Template 수정: 렌더 결과 자체가 달라져야 할 때. 서버 우선: 하이라이트나 포매팅처럼 서버에서 할 수 있는 일은 클라이언트 코드를 보내지 않습니다. Plugin: 렌더 후 브라우저가 필요한 DOM 작업에만 사용 — 스크롤 위치, 포커스, 관찰자, 서드파티 위젯.
:::

## 다음: 직접 실습 {#next}

[액션 플레이그라운드](/ko/examples/actions)에서 사용자 상호작용으로 template이 다시 렌더링되는 모습을 확인하세요. 버튼과 폼이 action → transition → frame → DOM 파이프라인으로 server 슬롯을 갱신하고, `LikeButton`은 `useAction`을 쓰는 client 아일랜드이며, `LikesPanel`은 `load`에서 저장소를 읽는 server 컴포넌트입니다. 다음으로 [Transition 가이드](/ko/guide/transition)에서 프레임이 이 props를 만드는 방법을 알아보세요.
