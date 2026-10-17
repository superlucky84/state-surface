---
title: 10분 퀵스타트
order: 1
demoHref: /examples/search
demoLabel: 검색 데모 보기
---

## 무엇을 만드는가 {#preview}

도서 제목을 입력하고 검색을 누릅니다. 로딩 스켈레톤이 즉시 나타나고, 이어서 서버에서 결과가 도착합니다 — 페이지는 새로고침되지 않습니다. 이 동작을 만드는 코드는 짧은 파일 4개뿐입니다. fetch 호출, DOM 조작, 클라이언트 상태, abort 처리 — 어느 것도 직접 작성하지 않습니다. 엔진이 전부 처리합니다.

:::diagram{label="검색하면 일어나는 일"}

```text
"design" 입력 → 검색 클릭
    ↓
[ 즉시     ]  결과 슬롯에 스켈레톤 표시, 서버 작업 시작
    ↓  600ms…
[ 다음 프레임 ]  일치하는 도서가 스켈레톤을 대체
    ↓
[ 다시 검색 ]  실행 중인 요청 자동 abort → stale 결과 없음
```

:::

:::callout{kind="info"}
4개 파일의 정체: `<Slot>` 하나를 둔 페이지(Surface), 컴포넌트 2개(검색 폼 + 결과 Template), `transitions/`의 Transition 1개. 새 기능을 만들 때마다 이 패턴을 반복합니다 — 달라지는 것은 슬롯, 컴포넌트, 서버 로직뿐입니다.
:::

## 시작 전 확인 {#prereqs}

- Node.js 20.19 이상, pnpm 설치 확인 (`node --version`, `pnpm --version`).
- TypeScript와 JSX 기초 문법을 알면 좋지만 필수는 아닙니다.
- React나 Vue를 써본 적 있다면 컴포넌트가 바로 익숙할 것입니다.

```bash label="새 앱 만들고 실행하기"
npx create-state-surface my-app
cd my-app
pnpm install
pnpm dev
```

:::callout{kind="tip"}
`pnpm dev`는 터미널 하나에 계속 켜 두세요. `routes/`와 `transitions/`에 새 파일을 저장하면 바로 반영되고 브라우저가 다시 로드됩니다. 앱은 `http://localhost:3000`에서 실행되며, 생성된 페이지 옆에 `/books` 페이지 하나를 추가합니다.
:::

## 파일 1 — 페이지(Surface) 만들기 {#step1}

:::analogy
페이지는 건물의 평면도이고, 요청마다 서버에서 그려집니다. `<Slot>`은 벽에 고정된 콘센트입니다. 콘센트 위치는 그대로이고 거기에 꽂힌 가전제품만 바뀝니다. 슬롯 바깥은 모두 벽이라 방문하는 동안 바뀌지 않습니다.
:::

```tsx label="routes/books.tsx ← 새 파일"
import { Slot } from 'state-surface';
import BookSearch from './books/_components/bookSearch.js';
import BookResults from './books/_components/bookResults.js';

export default async function Page() {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Book Search</title>
      </head>
      <body class="min-h-screen bg-slate-100 text-slate-900">
        <main class="mx-auto max-w-xl space-y-6 p-8">
          <h1 class="text-2xl font-bold">Book Search</h1>
          <BookSearch />
          <Slot name="books:results" mode="server">
            <BookResults query="" />
          </Slot>
        </main>
      </body>
    </html>
  );
}
```

- `routes/books.tsx`는 `GET /books`를 처리합니다. 페이지는 문서 전체를 반환하는 async 함수이고 `ctx`(`SurfaceContext`: URL, params, 쿠키)를 받지만, 이 페이지에는 필요 없습니다.
- `<Slot name="books:results">`는 `<h-state name="books:results">` 앵커를 렌더링합니다 — 이 페이지에서 transition이 바꿀 수 있는 유일한 부분입니다.
- `mode="server"`는 transition이 서버에서 렌더링한 HTML로 슬롯을 갱신한다는 뜻입니다. `mode`나 `client:*` 지시자가 없는 슬롯은 static이라 프레임으로 바꿀 수 없습니다.
- 슬롯의 유일한 자식이 초기 상태입니다. 자식의 props가 **곧** 슬롯 상태입니다. 여기서는 `query=""`가 빈 안내 문구를 렌더링합니다.

:::callout{kind="info"}
StateSurface 고유 부분은 `<Slot>`뿐이고 나머지는 직접 제어하는 평범한 JSX입니다. doctype, `client/styles.css`, `__SURFACE__` 부트스트랩 JSON, 엔진 스크립트는 엔진이 추가합니다 — 스크립트는 페이지가 `data-action`을 쓰기 때문에만 들어갑니다. 실제 앱에서는 `<html>` 뼈대를 `layouts/Layout.tsx`로 옮깁니다.
:::

:::callout{kind="tip"}
두 import는 2단계에서 만들 파일을 가리킵니다. 파일이 생기기 전까지 dev 서버에 import 에러가 보이는 것은 정상입니다.
:::

## 파일 2, 3 — 컴포넌트(Template) 만들기 {#step2}

:::analogy
Template은 props를 서버가 결정하는 React 컴포넌트입니다. 데이터를 fetch하거나 저장하지 않습니다. 서버가 슬롯 상태로 렌더링해서 HTML을 보내줍니다.
:::

```tsx label="routes/books/_components/bookSearch.tsx ← 검색 폼"
const BookSearch = () => (
  <form data-action="book-search" class="flex gap-2">
    <input
      name="query"
      placeholder="Search books..."
      class="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm"
    />
    <button type="submit" class="rounded-lg bg-slate-900 px-5 py-2 text-sm text-white">
      Search
    </button>
  </form>
);

export default BookSearch;
```

```tsx label="routes/books/_components/bookResults.tsx ← 결과 Template"
type Book = { title: string; author: string };
type Props = { query: string; loading?: boolean; books?: Book[] };

const BookResults = ({ query, loading, books }: Props) => {
  if (loading)
    return (
      <div class="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} class="h-6 animate-pulse rounded bg-slate-200" />
        ))}
      </div>
    );
  if (!books) return <p class="text-sm text-slate-400">Type a title and press Search.</p>;
  if (!books.length) return <p class="text-sm text-slate-500">No books match "{query}".</p>;
  return (
    <ul class="space-y-2">
      {books.map(book => (
        <li key={book.title} class="text-sm">
          <span class="font-medium">{book.title}</span>
          <span class="text-slate-400"> — {book.author}</span>
        </li>
      ))}
    </ul>
  );
};

export default BookResults;
```

- `BookSearch`는 슬롯 바깥의 평범한 페이지 마크업이라 한 번만 렌더링됩니다. 연결은 `data-action="book-search"`가 전부입니다. 폼을 제출하면 엔진이 폼 필드(`{ query: "design" }`)를 `book-search` transition에 보냅니다.
- `BookResults`는 `books:results`의 Template입니다. props를 받아 JSX를 반환하는 함수 하나이고, 이 슬롯의 모든 프레임은 정확히 이 props 객체입니다.
- `useState`, `useEffect`, `fetch`가 없습니다. 컴포넌트는 동기로 렌더링하고, 데이터는 페이지나 transition에서 await합니다.

:::callout{kind="tip"}
`_`로 시작하는 파일과 폴더는 페이지가 아니므로, `routes/books/_components/`에 두면 새 URL을 만들지 않고 컴포넌트를 페이지 옆에 둘 수 있습니다.
:::

## 파일 4 — Transition 만들기 {#step3}

:::analogy
Transition은 페이지의 자막 트랙입니다. 영상(HTML 페이지)은 계속 재생되고, `yield` 하나가 다음 자막 한 줄(NDJSON 한 줄)을 보내며 화면이 한 줄씩 갱신됩니다.
:::

```ts label="transitions/book-search.ts ← 서버 로직"
import { defineTransition } from 'state-surface/server';

const BOOKS = [
  { title: 'Design Patterns', author: 'Gang of Four' },
  { title: 'Clean Code', author: 'Robert C. Martin' },
  { title: 'Refactoring', author: 'Martin Fowler' },
];

export default defineTransition({
  targets: ['books:results'],
  async *handler(params) {
    const query = String(params.query ?? '').trim();

    // 프레임 1 (full): 모든 target 슬롯을 설정, 스켈레톤이 즉시 표시됨
    yield { type: 'state', states: { 'books:results': { query, loading: true } } };

    // DB 조회나 API 호출 대신
    await new Promise(resolve => setTimeout(resolve, 600));
    const books = BOOKS.filter(book => book.title.toLowerCase().includes(query.toLowerCase()));

    // 프레임 2 (partial): `changed`에 적은 슬롯만 변경
    yield {
      type: 'state',
      full: false,
      changed: ['books:results'],
      states: { 'books:results': { query, books } },
    };
    // `done` 프레임 없음: handler가 반환되면 엔진이 보냄
  },
});
```

- 파일 경로가 곧 이름입니다. `transitions/book-search.ts`는 `POST /transition/book-search`에 응답하고, `data-action`도 이 이름을 씁니다.
- `targets`는 이 transition이 바꿀 수 있는 슬롯 목록입니다. 실행 중에는 브라우저가 이 슬롯에 `data-pending`을 표시하고, target이 겹치므로 새 검색이 실행 중인 검색을 abort합니다.
- 첫 프레임은 반드시 full이어야 하며 모든 target 슬롯을 교체합니다. 이후 프레임은 partial(`full: false` + `changed`)로 나열한 슬롯만 바꿀 수 있습니다.
- 슬롯 상태는 컴포넌트의 props 객체 전체입니다. partial 프레임도 `books:results`를 통째로 교체하므로 프레임 2에서 `query`를 다시 보냅니다.

:::callout{kind="tip"}
`{ type: 'done' }`이나 error 프레임을 yield하지 마세요. 끝내려면 반환하고, 실패하려면 throw합니다. `TransitionError`(`state-surface/server`)의 메시지는 `layouts/Layout.tsx`가 제공하는 `system:error` 슬롯에 표시됩니다.
:::

:::callout{kind="info"}
여기서는 params가 타입 없이 도착합니다(`Record<string, unknown>`). 아무 Standard Schema(zod, valibot, arktype…)로 `input`을 추가하면 검증됩니다. 잘못된 params는 필드 에러와 함께 422를 받고 handler는 실행되지 않습니다. [Transition 가이드](/ko/guide/transition)를 참고하세요.
:::

## 전체 흐름 한눈에 보기 {#flow}

:::diagram{label="폼 제출 → DOM 업데이트"}

```text
[ 폼 제출 ]
    │  data-action="book-search", 필드 → { query: "design" }
    ▼
[ 브라우저: 액션 런타임 ]
    │  실행 중인 book-search abort (같은 targets)
    │  <h-state name="books:results">에 data-pending 표시
    │  POST /transition/book-search
    ▼
[ 서버: handler 실행 ]
    │  프레임 1 yield (full)     → <BookResults loading /> 렌더  → patch 한 줄 (reset)
    │  … 600ms "DB 조회" …
    │  프레임 2 yield (partial)  → <BookResults books /> 렌더    → patch 한 줄
    │  handler 반환              → done 한 줄
    ▼
[ 브라우저: op 적용 ]
    │  <h-state name="books:results"> 안의 HTML 교체
    ▼
[ 완료: data-pending 제거, data-has-result 설정 ]
```

:::

이 파이프라인이 StateSurface의 전부입니다. 페이지가 슬롯을 고정하고, Template이 서버에서 슬롯 상태를 HTML로 바꾸고, Transition이 상태 프레임을 스트리밍하고, Action(`data-action`)이 사용자 이벤트를 Transition에 연결합니다. 서버 통신, DOM 갱신, abort 처리를 직접 작성하지 않았습니다 — 엔진이 전부 처리합니다.

## 동작 확인 {#verify}

:::sequence
1. `pnpm dev`가 실행 중인지 확인합니다.
2. `http://localhost:3000/books`에 접속합니다. 폼과 안내 문구 “Type a title and press Search.”가 이미 서버 HTML에 들어 있습니다.
3. `design`을 입력하고 Search를 누릅니다.
4. 스켈레톤이 600ms 정도 보인 뒤 “Design Patterns — Gang of Four”가 나타나면 성공입니다.
5. Search를 빠르게 두 번 누르세요. 첫 요청은 abort되고 마지막 결과만 표시됩니다.
:::

:::callout{kind="note"}
DevTools → Network 탭에서 `book-search` 요청을 클릭하세요. 응답은 NDJSON입니다. `books:results`용으로 렌더링된 HTML을 op에 담은 `patch` 두 줄, 그리고 `{"type":"done"}`이 옵니다. 실행 중에는 `<h-state name="books:results">`에 `data-pending`이 붙습니다.
:::

:::debug{symptom="Search를 눌러도 아무것도 바뀌지 않음" cause="data-action 이름이 transitions/의 파일과 맞지 않음"}
파일 경로가 곧 이름입니다. `data-action="book-search"`는 `transitions/book-search.ts`를 실행합니다. 이름이 틀리면 Network 탭에 404 `Transition "…" not found`가 보입니다.
:::

:::debug{symptom="응답이 done 대신 error 프레임으로 끝남" cause="Slot에 mode가 없어 static 슬롯임"}
프레임은 static 슬롯을 바꿀 수 없으며, 에러 메시지에 `slot "books:results" is static and cannot be updated`가 보입니다. `<Slot name="books:results">`에 `mode="server"`를 추가하세요.
:::

:::debug{symptom="페이지에 import 에러가 보임" cause="2단계의 컴포넌트 파일이 없거나 이름이 다름"}
페이지는 `./books/_components/bookSearch.js`와 `./books/_components/bookResults.js`를 import합니다. `.js` 확장자는 같은 위치의 `.tsx` 파일로 해석됩니다.
:::

## 다음 단계 {#next}

퀵스타트를 완료했습니다. 각 개념을 깊이 이해하려면 아래 가이드를 순서대로 읽으세요.

- [Surface 가이드](/ko/guide/surface) — 슬롯 모드(static, server, client), 레이아웃, `<Boot>`.
- [Template 가이드](/ko/guide/template) — 슬롯 상태로서의 props, 서버 컴포넌트, 클라이언트 아일랜드.
- [Transition 가이드](/ko/guide/transition) — full·partial·removed 프레임, `targets`, `input` 스키마.
- [Action 가이드](/ko/guide/action) — `data-params`, 폼, `data-pending-targets`, `useAction`.
- [검색 데모](/ko/examples/search) — 같은 패턴에 `swap="morph"` 입력 슬롯을 더한 예제.
- [스트리밍 데모](/ko/examples/streaming) — 프레임 시퀀스를 단계별로 확인.
