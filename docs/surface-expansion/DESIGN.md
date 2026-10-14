# StateSurface 2.0 — 단일 파일 작성 모델과 Surface 확장 설계

작성일: 2026-10-13

상태: Draft / Review — 구현 전 검토 초안

요구사항은 [REQUIREMENTS.md](./REQUIREMENTS.md)를 따른다. 사용자와 합의한 목표,
현재 코드의 사실, 구현 방식의 권고와 TBD를 구분한다. 예시의 `Slot`, 지시자와 신규 프레임 필드는
제안이며 현재 공개 API가 아니다.
`ClientRouter`, `transition:persist`, `server:defer`, `defineTransition`, `defineCollection`,
`Image` 등 10장의 이름도 Astro 개념을 가리키는 가칭이다. 11장의 `createHandler`, `SurfaceContext`와
어댑터 패키지 이름도 가칭이다.
이번 작업은 두 문서까지다. `IMPLEMENT.md`와 `MANUAL_TEST_CHECKLIST.md`는 검토 후 작성한다.

## 1. 현재 기반과 설계의 출발점

| 경계                | 현재 코드                                                                                   | 재사용·변경 방향                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 페이지 계약         | [routeModule.ts](../../engine/shared/routeModule.ts): `layout(stateScript): string`         | 기존 계약을 유지하면서 서버 페이지 렌더 함수와 메타데이터를 추가한다.              |
| 라우트 발견         | [routeScanner.ts](../../engine/server/routeScanner.ts): `.ts`만 route로 인정                | `.tsx` 페이지의 발견·dev 로드·production 생성 모듈을 연결한다.                     |
| JSX·SSR             | [tsconfig.json](../../tsconfig.json), [ssrRenderer.ts](../../engine/server/ssrRenderer.ts)  | Lithent JSX와 `renderToString()`으로 페이지 트리를 렌더링한다.                     |
| 슬롯 채움           | [ssr.ts](../../engine/server/ssr.ts): 문자열의 h-state를 정규식으로 채움                    | 새 트리는 렌더 과정에서 슬롯을 처리하고 정규식 문자열 채움 경로는 제거한다(AG-08). |
| 컴포넌트 레지스트리 | [templateRegistry.ts](../../engine/shared/templateRegistry.ts): 이름과 TagFunction          | 슬롯 인스턴스·컴포넌트·모드·capability를 분리한다.                                 |
| 초기 클라이언트     | [main.ts](../../engine/client/main.ts), [auto.ts](../../engine/client/templates/auto.ts)    | 공통 로더·액션 런타임·아일랜드 로더·플러그인으로 분리한다.                         |
| 상태 적용           | [stateSurface.ts](../../engine/client/stateSurface.ts)                                      | reducer·프레임 큐를 활용하고 비동기 로드와 DOM 반영을 분리한다.                    |
| Lithent 갱신        | [lithentBridge.ts](../../engine/client/lithentBridge.ts)                                    | DataProxy와 기존 마운트를 활용하며 인스턴스 키를 슬롯 ID로 관리한다.               |
| 전송                | [server/index.ts](../../engine/server/index.ts), [ndjson.ts](../../engine/shared/ndjson.ts) | JSON 분기·혼합 모드 projection·스트림 상태 검증을 추가한다.                        |
| 서버 런타임         | [server/index.ts](../../engine/server/index.ts): Express 조립, `node:fs`·`node:crypto` 사용 | 웹 표준 `Request → Response` 코어와 런타임 어댑터로 분리한다(11장).                |
| UI·MPA              | [protocol.ts](../../engine/shared/protocol.ts), [styles.css](../../client/styles.css)       | 기존 UI 패치와 MPA opt-in을 활용하고 안전성·적용 순서를 보강한다.                  |
| 페이지 이동         | [main.ts](../../engine/client/main.ts): 문서당 1회 초기화, History API·링크 가로채기 없음   | 재초기화 가능한 runtime 수명과 선택형 라우터·prefetch를 추가한다(10장).            |
| 페이지 출력         | [routeHandler.ts](../../engine/server/routeHandler.ts): 모든 페이지 요청 시 SSR             | 페이지별 prerender·지연 server 슬롯 엔드포인트를 추가한다.                         |
| 콘텐츠·자산         | [content.ts](../../shared/content.ts): 4천여 줄 TS 객체, 이미지 처리 도구 없음              | 스키마 검증 콘텐츠 컬렉션과 이미지 컴포넌트를 추가한다.                            |

기존 코드 검토에서 `pnpm test`는 34개 파일/458개 테스트가 통과했고 client build도 성공했다.
공통 JS는 98.52kB / gzip 추정 28.21kB였다. 이는 새 구조의 측정 결과가 아니다.
happy-dom의 간단한 브리지 실험에서 props 갱신 후 인스턴스 1개, 입력 DOM·초안·포커스
유지를 확인했다. 실제 브라우저, 중첩·제거·reset까지 보장한 결과는 아니다.

안전성 보강 근거도 확인했다. 잘못된 `ui.classAdd` 타입이 현재 프레임 검증을 통과하고,
SSR의 UI 클래스 문자열에 따옴표를 넣으면 추가 HTML 속성이 생성된다.
외부 입력을 허용하기 전에 검증과 속성 이스케이프를 보강해야 한다(V-10).

## 2. 작성 경험

### 2.1 최종 형식: async 컴포넌트 `.tsx` 페이지 (DC-07 결정)

전용 확장자(`.surface`) 없이 **`.tsx` 한 파일**이 최종 작성 형식이다. 함수 본문이 Astro의 `---` 영역
(요청마다 실행되는 서버 스크립트), `return`의 JSX가 템플릿 영역에 해당한다. TypeScript·Prettier·ESLint·
에디터·AI 도구를 추가 개발 없이 그대로 사용한다. 다음은 `routes/article/[id].tsx` 예시다. ArticleBody는
서버에서 갱신하고 ArticleEditor는 화면에 들어올 때 활성화하며 LikeButton은 서버 갱신이 없는 독립 아일랜드다.

```tsx
import type { SurfaceContext } from 'state-surface/server';
import { Slot } from 'state-surface';
import Layout from '../../layouts/Layout';
import ArticleBody from '../../components/ArticleBody';
import ArticleEditor from '../../components/ArticleEditor';
import EditorSkeleton from '../../components/EditorSkeleton';
import LikeButton from '../../components/LikeButton';
import { getArticle } from '../../server/articles';
import s from './article.module.css';

export const prerender = false;

export default async function Page(ctx: SurfaceContext) {
  const article = await getArticle(ctx.params.id); // ← 서버 스크립트 영역

  return (
    <Layout title={article.title}>
      <main class={s.main}>
        <h1>{article.title}</h1>

        <Slot name="article:body" mode="server">
          <ArticleBody article={article} />
        </Slot>

        <Slot name="article:editor" client:visible fallback={<EditorSkeleton />}>
          <ArticleEditor articleId={article.id} />
        </Slot>

        <LikeButton count={article.likes} client:idle />
      </main>
    </Layout>
  );
}
```

- **페이지 계약**(DC-07 결정): `default export`는 `async (ctx: SurfaceContext) => JSX`다. 페이지 옵션은
  named export로 선언한다(`prerender`, `getStaticPaths`, 필요 시 `transition`·`boot` 등 후속 DC에서 확정).
  `definePage({ load, render })` 형태는 사용하지 않는다.
- **레이아웃**: 일반 컴포넌트(`Layout`)로 작성하며 props와 children을 받는다. 레이아웃도 async일 수 있고
  같은 `ctx`가 필요하면 props로 넘긴다(암묵적 컨텍스트 없음, DC-27).
- **Slot 문법**(DC-01 결정): 서버 transition이 갱신하는 경계는 `<Slot>`으로 감싸고, 갱신 없는 독립 아일랜드는
  컴포넌트에 직접 지시자를 붙인다(`<LikeButton client:idle />`). 둘 다 같은 내부 SlotDefinition으로 정규화한다.
- **단일 자식 엘리먼트**: `<Slot>`의 자식은 컴포넌트 엘리먼트 정확히 1개다. 그 props가 슬롯 상태이며
  transition 프레임은 같은 props 모양을 보낸다(`states: { 'article:body': { article } }`). JSX 타입 검사가
  props와 상태 모양을 함께 검증한다. 자식이 0개·2개 이상·텍스트·Fragment·조건식이면 빌드 플러그인이 진단한다.
  Astro처럼 컴포넌트 props로 데이터를 넘긴다는 점은 같고, 이름 붙은 갱신 경계를 둔다는 점이 다르다.
- **ID**: `<Slot>`의 `name`은 필수이며 transition이 겨냥하는 안정 식별자다. 직접 지시자 아일랜드는
  자동 ID를 받고 프레임 대상이 될 수 없다. 형식·중복·반복 규칙은 4.3(DC-08)을 따른다.
- **fallback**: `client:only`·`server:defer` 등의 선표시 콘텐츠는 `fallback` prop으로 쓴다(`<Slot>`과 직접
  지시자 공통).
- **Slot 속성**: `name`, `mode`(static/server/client, 생략 시 4.1 정규화 규칙), client 지시자, `server:defer`,
  `fallback`, `capability`, `resetKey`, `swap`(server 모드 HTML 적용 방식, 4.3). 자식 props와 엔진 속성이 섞이지 않는다.
- **지시자 표기**: `client:visible` 같은 namespaced JSX 속성을 사용한다. TypeScript는 5.1부터 namespaced
  JSX 속성의 타입 검사를 지원한다. esbuild·Vite 변환 통과 여부를 2단계 시작 시 spike로 확인하고,
  막히면 대체 표기(예: `clientVisible`)를 정한다. `Slot`·지시자 타입은 `state-surface`가 JSX 타입 선언으로 제공한다.

### 2.2 전용 파일 형식을 두지 않는 이유

Astro식 `.surface` + `---` 형식을 검토했으나 채택하지 않았다(DC-07, 2026-10-14). 전용 확장자는
TextMate·tree-sitter 문법, Volar 기반 언어 서버·VS Code 확장, `surface check` CLI, Prettier 플러그인·
ESLint 프로세서를 별도로 만들고 TypeScript 버전에 맞춰 계속 유지해야 하며, 그 전까지는 `.tsx`보다 작성
경험이 나쁘다. async 컴포넌트 `.tsx`는 AG-03의 "한 파일의 자연스러운 트리" 목표를 그대로 충족한다.
잃는 것은 `---` 외형과 파일 안 `<style>`이며, scoped CSS는 CSS Modules로 제공한다(10.6, DC-23).
전용 형식은 비목표이며 향후 재검토가 필요하면 `.surface → 가상 .tsx` 변환 + Volar 방식을 출발점으로 한다.

### 2.3 요청 시 실행과 데이터 전달

- 페이지 함수 본문이 요청마다 실행되는 서버 스크립트다. 모듈 최상위 `await`로 요청 데이터를 준비하지 않으며
  요청 데이터를 모듈 전역에 저장하지 않는다. import와 안전한 정의는 모듈에서 관리할 수 있다.
- Context는 params, 요청 정보, 인증된 사용자 등을 서버에서 제공한다. 웹 표준 `Request` 기반
  `SurfaceContext`(11.2)를 명시적 인자로 받는다(DC-27 결정).
- 레이아웃도 같은 서버 렌더 계약으로 props와 children을 받는다. 일반 마크업·조건·반복은
  서버에서 평가한다. 비동기 데이터는 페이지·레이아웃 함수 본문에서 준비한다.
- client 아일랜드의 props는 명시적으로 공개할 값이다. 함수·Request·비밀 값을 자동 직렬화하지 않는다.
  JSON 변환 불가능한 값은 조용히 누락하지 않고 진단한다. Date/BigInt 등의 추가 codec은 TBD다.
- 서버 영역의 임의 클로저를 client 코드로 추출·복원하는 기능은 제공하지 않는다. client 컴포넌트는 별도
  모듈에서 import한다. 라우트 탐색·URL 충돌 규칙은 3.1(DC-16)을 따른다.

## 3. 빌드 플러그인의 경계

전용 컴파일러는 두지 않는다(DC-07). `.tsx` 변환은 TypeScript/esbuild와 Lithent JSX가 맡고, StateSurface의
Vite 플러그인은 Slot·지시자 선언 분석, 진단, manifest·가상 모듈 생성만 담당한다.

```text
.tsx 페이지·레이아웃·컴포넌트
        ↓ AST 분석·선언 검증 (Vite 플러그인)
PageDefinition + SlotDefinition
        ├─ 서버: 요청 렌더 함수, 등록 렌더러, action과 권한
        ├─ 브라우저 메타데이터: slotId, mode, activation, 공개 props
        └─ client 의존성: 명시한 컴포넌트, 공유 런타임, CSS
                          ↓
                   Vite 청크와 manifest
```

Vite 플러그인과 가상 모듈 방식을 사용한다(DC-02 결정). 선언 분석·정규화·코드 생성은
플러그인 내부에서 분리하고 dev와 production에서 같은 처리를 호출한다. 가상 모듈에는
client 컴포넌트만 import한다. 이름 조사에 전체 템플릿의 브라우저 import를 사용하지 않으며
`engine/client/templates/auto.ts`의 eager glob은 제거한다(AG-08).

- **파서**(DC-02 결정): `oxc-parser`로 원본 TSX를 `transform` 훅(`enforce: 'pre'`)에서 분석한다. JSX 변환
  이전의 AST에서 `<Slot>`·지시자 속성·import 선언을 읽는다. 빌드 시에만 쓰므로 런타임 번들에 포함되지 않는다.
- **아일랜드 식별**(DC-02 결정): client 지시자가 붙은 엘리먼트와 client 모드 `<Slot>`의 자식 엘리먼트는
  **정적 import로 가져온 식별자**여야 한다. 플러그인이 import 소스를 해석해 componentId(모듈 경로+export
  이름)를 확정한다. 변수·조건식·멤버 접근 등으로 계산한 컴포넌트(`const C = a ? A : B; <C client:load />`)는
  원본 위치와 함께 빌드 오류로 보고한다. 조건 분기는 각 분기에 지시자를 쓴 엘리먼트로 작성한다. 명시 registry는 두지 않는다.
- **분석 범위**: 페이지에서 import 그래프를 따라 레이아웃·서버 컴포넌트 안의 선언까지 수집한다. 같은
  컴포넌트가 여러 페이지에서 쓰여도 componentId 하나로 합친다.
- **청크 단위**(DC-02 결정): 아일랜드 컴포넌트마다 동적 `import()` 청크를 만든다. Lithent·엔진 런타임 등 공유
  의존은 Vite/Rollup이 공통 청크로 분리한다. 가상 모듈 `virtual:state-surface/islands`가 componentId →
  loader 맵을 제공하고, 빌드 manifest가 각 청크의 CSS·preload 목록을 연결한다.
- **요청별 수집**: SSR 중 `<Slot>`·아일랜드 래퍼가 요청 스코프 수집기에 실제 렌더된 인스턴스(slotId,
  componentId, 활성화 조건, 공개 props)를 기록하고 bootstrap에는 이것만 넣는다. 조건 때문에 렌더되지 않은
  아일랜드는 로드하지 않는다. `client:load` 청크만 modulepreload 대상이다.

빌드 manifest는 페이지에서 도달 가능한 컴포넌트 목록과 loader를 만들고, 요청 SSR은 실제
출력한 슬롯 인스턴스·공개 props만 bootstrap에 넣는다. 레이아웃·서버 컴포넌트 안의 선언도
분석해야 하며 조건 때문에 출력되지 않은 아일랜드를 초기 로드하지 않는다. 동적으로 계산한
컴포넌트는 허용하지 않는다(DC-02). 빌드의 컴포넌트 목록과 요청별
슬롯 인스턴스 목록을 같은 정보로 취급하지 않는다.

새 책임의 배치 후보는 `engine/build/`(Vite 플러그인 `state-surface/vite`)다. 공개 entry는 DC-28의 단일 패키지
subpath를 따른다. `engine/shared/`에 Node 전용 의존성을 섞지 않는다.

- static/server 전용 코드는 서버 의존성 그래프에 둔다. lazy import만으로 client 출력에서
  제외됐다고 판정하지 않고 client의 전이 의존성도 검사한다.
- **서버 전용 보호**(DC-02 결정): 모듈이 `import 'state-surface/server-only'` 마커를 갖거나 파일명이
  `*.server.ts(x)`이면 서버 전용이다. `node:*` 모듈도 같은 규칙을 적용한다. client 청크의 전이 의존성에
  서버 전용 모듈이 들어오면 빌드를 실패시키고 import 경로 체인을 보여 준다
  (`components/Chart.tsx → lib/fmt.ts → server/db.ts`). 마커 모듈 자체는 client 번들에서 import되면 throw한다.
  파일명·마커만으로 비밀 코드가 없다고 보장하지 않으므로 V-05는 client 출력 전체에 sentinel 문자열이 없는지
  교차 검사한다.
- CSS 추출·로딩을 client 청크에 연결한다. 활성화 전후 CSS 누락과 CLS, Tailwind source 탐색,
  runtime UI 클래스 허용 토큰의 생성·포함을 검증한다.
- dev 라우트 로딩은 Vite의 서버 모듈 로드 등 플러그인 transform이 적용되는 경로를 사용한다. tsx 직접
  import만으로는 Slot 분석·지시자 변환이 적용되지 않는다.
- production은 빌드가 생성한 route registry를 사용한다(11.4).
- BASE_PATH, asset manifest, 동적 청크 CSS, 소스맵과 scaffold overrides에 같은 설정을 반영한다.
  기존 `resolveAssetCss()`에도 동적 import의 관련 CSS를 처리하는 계약이 필요하다.

### 3.1 프로젝트 구조·진단·scaffold (DC-16 결정)

```text
routes/                      페이지 (routes/**/*.tsx, _로 시작하는 파일·폴더 제외)
  index.tsx                  → /
  guide/[slug].tsx           → /guide/:slug
  guide/_components/Toc.tsx  (페이지 아님)
  _shared/...                (페이지 아님)
transitions/                 transition 자동 등록 (transitions/search.ts → 'search')
components/ layouts/ ...     위치 자유 (import로 참조)
```

- **라우트 탐색**: `routes/**/*.tsx` 중 `_`로 시작하는 파일·폴더 아래가 아닌 파일이 페이지다(Astro와 같은 규칙).
  페이지 옆 보조 파일은 `_components/` 등 `_` 폴더에 둔다. `a.tsx`와 `a/index.tsx`처럼 같은 URL로 해석되는
  파일, default export가 없는 페이지 파일은 빌드 오류다. 동적 세그먼트는 기존 `[param]` 규칙을 유지한다.
- **transition 등록**: 루트 `transitions/**/*.ts`를 빌드가 registry로 생성한다. 이름은 디렉터리 기준 상대
  경로(`transitions/chat/send.ts` → `'chat/send'`)이며 중복은 빌드 오류다. 기존 `routes/**/transitions/`
  관례는 제거한다(AG-08). 서버 액션(R-21)은 별도 디렉터리 없이 transition에 통합한다(DC-22).
- **진단 채널 3단**:
  1. **타입**: `state-surface`가 `<Slot>` 속성·지시자 값·`SurfaceContext`·`definePlugin`의 JSX/TS 타입을 제공해
     에디터에서 즉시 오류를 보인다. 페이지 default export 시그니처도 타입으로 검사한다.
  2. **Vite 플러그인**: 타입으로 표현할 수 없는 규칙(Slot 자식 1개, 계산된 아일랜드, Slot-in-Slot, 이름 형식·
     중복, 서버 전용 유출, 라우트 충돌, 지시자 조합 모순)은 dev에서 Vite 오류 오버레이로, build에서 실패로
     보고한다. 모든 메시지는 `[state-surface]` 접두어, 원본 `파일:줄:열`, 코드 프레임, 해결 힌트를 포함한다.
  3. **`state-surface check` CLI**: CI용으로 `tsc --noEmit`과 플러그인 분석만 빠르게 실행한다(번들 생성 없음).
     ESLint 플러그인은 1차 범위가 아니며, 규칙은 Vite 플러그인 한 곳에서 구현한다.
- **런타임 진단**: dev에서만 프레임 위반·알 수 없는 슬롯·플러그인 DOM 소유권 위반을 경고하고 devOverlay
  (`?debug=1`)에 표시한다. production에서는 trace 훅으로만 노출한다.
- **소스맵**: dev·build 모두 원본 TSX 소스맵을 유지한다. 플러그인 변환(지시자 → 래퍼)도 소스맵을 생성한다.
- **dev/prod 동일성**: dev는 Vite SSR 모듈 로드, prod는 빌드 registry를 쓰지만 같은 분석·manifest 생성 함수를
  호출한다. CI에서 같은 적합성 테스트(V-28)를 dev 서버와 production 빌드 양쪽에 실행한다.
- **scaffold**: `create-state-surface` 기본 템플릿은 **최소 스타터**(페이지 1개에 static 마크업·server 슬롯·
  client 아일랜드 하나씩, transition 1개)다. `--template demo`는 현재 쇼케이스 사이트를 생성한다. 어댑터는
  프롬프트로 고르며 기본은 Node(DC-28). 템플릿은 저장소에 원본으로 두고 CI에서 생성·설치·빌드·테스트한다.
  데모를 복사해 overrides를 덧씌우는 현재 `build-scaffold.mjs` 방식은 대체한다(AG-08).

## 4. SlotDefinition, SSR과 DOM 소유권

### 4.1 내부 메타데이터 후보

| 필드                    | 의미                                                | 공개 범위                                         |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------- |
| `slotId`                | 페이지 내 인스턴스의 고유 ID. 기존 name의 대응 대상 | 브라우저·허용된 프레임                            |
| `componentId`           | 재사용 컴포넌트 식별자                              | client loader key. 서버 함수 자체는 비공개        |
| `mode`                  | static / server / client                            | 브라우저 적용 분기                                |
| `activation` / `ssr`    | load / idle / visible / media, SSR 여부             | client 슬롯 scheduler                             |
| `capability` / `schema` | 데이터·콘텐츠·UI의 허용 규칙                        | 서버에서 강제하고 필요한 검증만 브라우저에도 제공 |
| `resetKey`              | 명시적 인스턴스 초기화 식별자                       | client 상태 수명                                  |
| `actionTargets`         | 등록 액션이 변경할 수 있는 슬롯 집합                | 서버가 정본. 클라이언트 입력으로 확장하지 않음    |

현재는 slot name이 template key와 mount key다. 새 registry·bridge는 slotId로 인스턴스를
관리하고 같은 componentId를 여러 슬롯에서 사용할 수 있게 한다(DC-08).
페이지·build ID는 배포 버전과 액션 registry를 연결한다. 브라우저에 보낸 ID·메타데이터 자체는
인증·권한 근거가 아니며 서버가 등록 정보와 요청 권한을 다시 확인한다.

선언 정규화 권고안은 모드·지시자 없음 → static, client 지시자 있음 → client,
명시적 client와 timing 없음 → load, only → SSR 생략이다. 명시적 static/server에 client 지시자를
붙이면 진단하고 capability는 strict를 기본으로 한다. 이 기본값과 조합은 DC-01/DC-04/DC-13에서
결정하며 기존 defineTemplate 기반 템플릿도 새 정의로 전환해 같은 기본값을 적용한다(AG-08).

### 4.2 SSR과 초기 데이터

| 모드          | SSR                        | 브라우저에 보내는 데이터·코드                                        | 갱신 소유자                           |
| ------------- | -------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| static        | HTML                       | 컴포넌트 JS·재렌더 데이터 불필요                                     | 방문 중 콘텐츠 고정                   |
| server        | HTML                       | 슬롯·액션 메타데이터와 공통 runtime. 입력 데이터는 원칙적으로 비공개 | 서버 렌더 결과를 반영하는 DOM adapter |
| client        | 기본 HTML                  | SSR snapshot props, 공개 metadata, 필요한 시점의 청크                | 활성화된 Lithent 인스턴스             |
| client + only | fallback HTML 또는 빈 경계 | 공개 props와 청크                                                    | 브라우저 최초 mount                   |

server 입력을 `__STATE__`에서 제외하더라도 슬롯의 존재까지 제외하면 안 된다.
DOM 등록 집합, 활성 갱신 대상, client props와 server 전용 상태를 별도로 관리한다.
기존 `__STATE__`/`__UI__`/`__BOOT__`는 새 bootstrap(DC-09)으로 대체하고 제거한다(AG-08).
JSON·속성 직렬화 규칙을 통일하고 초기 UI와 hydration의 중복 적용을 방지한다.

### 4.3 HTML 적용과 중첩

최초 구현은 평탄한 갱신 슬롯과 명시적인 DOM 소유자부터 시작하는 안을 권고한다.
정적 Layout 안에 여러 슬롯을 배치하는 것은 이 제한과 양립한다.

- **server HTML 적용**(DC-03 결정): server 슬롯은 transition이 보낸 서버 렌더 HTML로 갱신된다. 상태
  병합(full·partial·accumulate·removed)은 서버가 요청 단위로 처리하고 브라우저는 결과 HTML만 적용한다(6.1).
  - **기본 `swap="replace"`**: 슬롯 내부 HTML을 통째로 교체한다. 교체 전 플러그인 cleanup과 내부 아일랜드
    dispose, 교체 후 플러그인 재적용과 아일랜드 재활성화를 수행한다(DC-08·DC-12).
  - **포커스·스크롤 best-effort 복원**: 교체 전 슬롯 안 포커스 요소의 `id`·선택 범위와 슬롯 내부 스크롤
    컨테이너(`id` 기준)의 위치를 기록하고, 새 HTML에 같은 `id`가 있으면 복원한다. 없으면 복원하지 않는다.
  - **opt-in `swap="morph"`**: 입력·포커스·펼침·미디어 상태를 유지해야 하는 슬롯은 기존 DOM과 새 HTML을
    비교해 변경분만 적용한다. 구현은 **idiomorph**(htmx·Turbo가 사용하는 DOM morph 라이브러리, id 기반 매칭)를
    사용하고 버전을 고정한다. morph 코드는 `swap="morph"` 슬롯이 있는 페이지에서만 로드하며 크기를 NFR-01
    예산에 포함해 측정한다. morph 중에도 내부 아일랜드 경계는 morph 대상에서 제외하고 DC-08 수명 규칙을 따른다.
  - **script 미실행**: 적용하는 HTML 안의 `<script>`는 실행하지 않으며 dev에서 경고한다. 이벤트 핸들러
    속성 등 HTML 안전성은 capability 정책(8장)을 따른다.
  - 입력 보존이 필요하면서 상호작용 로직도 큰 UI는 client 아일랜드로 작성하도록 가이드한다.
- **Slot-in-Slot 금지**(DC-08 결정): `<Slot>`의 자식 컴포넌트 트리 안에 다시 `<Slot>`을 두면 빌드 플러그인이
  진단한다. 정적 Layout·페이지 마크업 안에 여러 `<Slot>`을 나란히 두는 것은 허용한다.
- **server 슬롯 안 아일랜드는 재생성**(DC-08 결정): server 슬롯 컴포넌트 안의 직접 지시자 아일랜드는
  허용한다. 부모 슬롯이 교체되면 기존 아일랜드를 dispose하고 새 HTML의 아일랜드를 다시 활성화한다.
  로컬 상태는 초기화되며 이 수명을 가이드에 명시한다. 상태 보존(detach/reattach)은 후속 범위다.
- **client 아일랜드 children**(DC-08 결정): client 아일랜드에 넘긴 JSX children은 서버에서 HTML로 렌더해
  정적 조각으로 전달한다(Astro 방식). 아일랜드는 지정한 위치에 그대로 출력만 하고 내부를 수정하지
  않는다. children의 서버 전용 코드·데이터는 브라우저로 가지 않는다. 전달 형식(템플릿 요소 등)은 구현에서 정한다.
- client 내부는 일반 Lithent 자식 컴포넌트로 작성한다. 외부 runtime이 그 내부 DOM을 HTML로 교체하지 않는다.
- **이름 형식·구역**(DC-08 결정): `<Slot name>`은 `[a-z0-9-]+(:[a-z0-9-]+)*` 형식의 문자열 리터럴이다.
  레이아웃·페이지·컴포넌트 안의 모든 `<Slot>`이 한 페이지 안에서 하나의 이름 구역을 공유하며, 중복은
  빌드에서, 빌드로 판정할 수 없는 경우 SSR에서 진단한다. `#`은 후속 key 반복 슬롯(`comment#42`)용으로 예약한다.
- **반복**(DC-08 결정): 직접 지시자 아일랜드와 `server:defer`는 Astro처럼 루프 안에서 자유롭게 반복할 수
  있다(자동 ID, 프레임 대상 아님). transition 대상 `<Slot>`은 1차에서 정적 이름만 허용하며 목록은 슬롯
  하나가 목록 컴포넌트를 갖고 partial·accumulate로 갱신한다. key 반복 `<Slot>`은 후속 범위다.
- **componentId**: 빌드 플러그인이 모듈 경로 + export 이름으로 생성한다. 같은 컴포넌트를 여러 슬롯·아일랜드에서
  써도 인스턴스는 slotId(자동 ID 포함)별로 독립이다.
- 알 수 없는 슬롯·중복 slotId·미지원 동적 선언은 적용 전에 진단한다.
  기존 전체 anchor 탐색과 정규식 치환만으로 중첩 보존을 보장하지 않는다.

## 5. 클라이언트 로더와 아일랜드 수명

### 5.1 엔트리 선택

| 페이지에 필요한 기능            | 초기 runtime                                                    |
| ------------------------------- | --------------------------------------------------------------- |
| static, action/boot/plugin 없음 | 실행 script 없음                                                |
| server 액션·스트림              | loader와 액션·protocol·HTML adapter. Lithent 불필요             |
| 지연 client 활성화              | 작은 scheduler와 metadata. 필요한 시점에 Lithent·대상 청크 로드 |
| client:load                     | 시작 시 대상 청크와 공유 Lithent 로드                           |

#### 클라이언트 플러그인 (DC-12 결정)

현재는 `client/main.ts`가 Prism·목차·채팅 스크롤 플러그인을 모든 페이지에 로드하고, 훅
(`onMount/onUpdate/onUnmount`)이 client 렌더 기준이라 server 교체·morph·라우터 이동 시점이 정의되지 않았다.

```ts
// client/plugins/chatScroll.ts
export const chatScroll = definePlugin({
  name: 'chat-scroll',
  slots: ['chat:messages'], // 대상 슬롯(생략 시 페이지의 모든 슬롯)
  load: 'idle', // 'load' | 'idle'(기본) | 'visible'
  attach(el, { slot, mode }) {
    const ro = new ResizeObserver(() => (el.scrollTop = el.scrollHeight));
    ro.observe(el);
    return () => ro.disconnect(); // 교체·제거·페이지 이동 직전
  },
  update(el) {
    el.scrollTop = el.scrollHeight; // 같은 DOM이 유지되는 갱신
  },
});

// routes/examples/chat.tsx
export const plugins = [chatScroll];
```

- **서버 우선 원칙**(권고): 코드 하이라이트처럼 서버에서 할 수 있는 DOM 보강은 SSR·server 렌더에서 처리해
  클라이언트 JS를 0으로 만든다. Prism은 서버 하이라이트로 옮기는 것을 우선 검토한다. 클라이언트 플러그인은
  스크롤·관찰자·목차 하이라이트처럼 브라우저에서만 가능한 일에 사용한다.
- **선언 위치**: 페이지·레이아웃의 `export const plugins`. 빌드 플러그인이 수집해 플러그인별 청크로 만들고
  선언한 페이지(레이아웃 선언 시 그 레이아웃을 쓰는 페이지)에서만 로드한다. 전역 플러그인 설정은 두지 않는다.
- **훅 계약**: `attach(el, info)`는 슬롯 DOM이 준비될 때 호출되고 반환한 cleanup은 그 DOM이 사라지기 직전에
  호출된다. `update(el, info)`는 같은 DOM이 유지되는 갱신에 호출된다. 모드별 호출 시점은 다음과 같다.

  | 상황                                    | 호출                                              |
  | --------------------------------------- | ------------------------------------------------- |
  | SSR 표시·client 활성화·지연 슬롯 채움   | `attach`                                          |
  | server `swap="replace"`                 | cleanup → (교체) → `attach`                       |
  | server `swap="morph"`·client props 갱신 | `update`                                          |
  | removed·라우터 페이지 교체·dispose      | cleanup                                           |
  | 라우터 persist 요소(10.2)               | 유지(cleanup·attach 없음), 새 페이지에서 `update` |

- **로드 시점과 늦은 등록**: 기본 `idle`, 필요하면 `load`·`visible`. 플러그인이 로드되는 순간 이미 표시된 대상
  슬롯 전부에 `attach`를 호출해 늦게 와도 놓치지 않는다. 로드 전에 사라진 슬롯에는 호출하지 않는다.
- **전역 이벤트**: 액션 시작·종료 같은 페이지 수준 이벤트는 `onPage({ signal })`·`onAction` 훅(가칭)으로
  받는다. 기존 `onInit`·`onTransitionStart/End`는 제거하고 이 훅으로 대체한다(AG-08).
- **DOM 소유권**: 플러그인은 슬롯 DOM을 보강(속성·리스너·관찰자)만 하고 구조를 바꾸지 않는다. client 아일랜드
  내부 DOM은 Lithent 소유이므로 플러그인은 아일랜드 경계 안을 수정하지 않는다. 위반은 dev에서 경고한다.

### 5.2 활성화 상태

```text
SSR 표시 / only fallback
          ↓ trigger
        loading → 실패(SSR 유지·재시도)
          ↓
        active → props update
          ↓ remove / reset / replace
        disposed
```

- **시점**(DC-04 결정): `load`는 로더 시작 즉시. `idle`은 `requestIdleCallback`(timeout 2초), 미지원 브라우저는
  `load` 이벤트 후 200ms. `visible`은 `IntersectionObserver`(rootMargin 200px), `media`는 `matchMedia` 일치 시점.
  IntersectionObserver·matchMedia가 없으면 `idle`로 대체한다.
- **조합**: `client:only`는 ssr=false로 정규화하고 단독이면 `load`, 다른 시점 지시자와 조합할 수 있으며 그동안
  `fallback`을 표시한다. 시점 지시자를 둘 이상 붙이거나 모드와 모순되면 빌드 오류다.
- **청크 선로드**: `client:load` 청크만 modulepreload한다. 나머지는 트리거 시 요청한다(라우터 prefetch는 DC-20).
- **로드 실패**(DC-04 결정): 1초 뒤 한 번 재시도한다. 그래도 실패하면 SSR HTML을 유지하고(`client:only`는
  fallback 유지) `reportError`로 관측 도구에 전달한다(8.3). 실패 원인이 배포 교체(buildId 불일치)면 다음 사용자
  조작 시 문서를 다시 로드한다.
- **로더 예산**(DC-04 결정): 로더(스케줄러·관찰자·첫 이벤트 수집·`__SURFACE__` 읽기)는 gzip 2KB를 **목표**로
  측정·보고한다(CI 강제 없음). Lithent·프로토콜 런타임·morph는 필요할 때 별도 청크로 로드하며 크기를 따로 기록한다.
- 모듈 로드 promise는 componentId로 공유하고 인스턴스는 slotId별로 유지한다.
  제거·reset으로 generation이 바뀌면 이전 로드가 완료돼도 mount하지 않는다.
- 휴면 상태에서도 검증된 프레임을 순서대로 reducer에 적용한다. accumulate delta를 먼저
  병합해 최신 props·revision을 보관한다. UI-only 패치는 슬롯 root에 적용할 수 있다.
- SSR DOM과 최신 props가 다르면 SSR snapshot으로 hydrate한 뒤 최신 props를 갱신한다(5.3, DC-05).
- **활성화 전 조작**(DC-04 결정): 로더는 휴면 아일랜드 경계 안의 `pointerdown`·`focusin`·`keydown`을 감지하면
  예정 시점과 무관하게 즉시 활성화를 시작한다. hydration은 기존 SSR DOM 노드를 재사용하므로 그 사이 입력한
  값·커서·포커스를 덮어쓰지 않아야 한다(Lithent hydration이 사용자 입력 value를 SSR 값으로 되돌리지 않는지
  검증, V-04). 활성화 전 클릭 자체는 재생하지 않는다. 첫 클릭부터 반드시 동작해야 하는 UI는 `client:load`를 쓰도록 가이드한다.
- data-action의 첫 click/submit을 공통 로더에서 잡고 폼 값을 즉시 snapshot해 한 번 실행하는 안이다.
  임의 이벤트·trusted user activation의 재현은 지원하지 않는다. clipboard/fullscreen 등은
  eager 활성화나 다음 명시적 조작을 사용한다. 정확한 범위는 DC-04/DC-11에서 결정한다.

### 5.3 로컬 상태와 DOM 반영

**인스턴스 수명**(DC-05 결정):

```tsx
<Slot name="article:editor" client:visible resetKey="articleId">
  <ArticleEditor articleId={a.id} />
</Slot>
// articleId 42 → 43 props 도착: 기준 값 변경 → 인스턴스 재생성(로컬 상태 초기화)
// 같은 42의 제목만 변경: 인스턴스 유지, 입력 초안·토글·포커스 보존

// transition의 명시 reset (예: 저장 완료 후 폼 비우기)
yield { type: 'state', full: false, states: { 'article:editor': next },
        changed: ['article:editor'], reset: ['article:editor'] };
```

- 같은 slotId·componentId에서 props만 바뀌면 기존 DataProxy·마운트를 재사용해 Lithent diff로 갱신한다. 로컬 상태는
  유지된다. props를 매 render마다 local state에 복사하지 않도록 가이드한다.
- `resetKey`는 Slot에 선언하는 **기준 prop 이름**(또는 이름 배열)이다. 새 props의 그 값이 이전과 다르면 엔진이
  기존 인스턴스를 dispose하고 새로 mount한다(React `key`와 같은 발상). 직접 지시자 아일랜드에도 같은 속성을 쓴다.
- transition은 작성 프레임의 `reset: [slotId]`로 명시적 초기화를 요청할 수 있다. 전송 층에서는 `props` op의
  `reset: true` 플래그로 전달한다(DC-09 op 확장). server 슬롯에는 의미가 없으므로 진단한다.
- 재생성·제거·컴포넌트 교체 시 로컬 상태는 사라진다. DOM 구조·key 변경으로 입력 노드가 제거된 경우의 포커스
  보존은 보장하지 않는다. server 슬롯 안 아일랜드는 부모 교체 시 재생성된다(DC-08).

**휴면 중 갱신과 hydration**(DC-05 결정): 활성화 전에 서버 갱신이 오면 엔진은 최신 props를 보관만 한다. 활성화 시
`__SURFACE__`의 **SSR 당시 props(snapshot)로 먼저 hydrate**해 DOM과 정확히 일치시킨 뒤, 보관한 최신 props로 즉시
갱신해 diff만 반영한다. 휴면 중 `reset`이나 resetKey 변경이 있었다면 hydrate 대신 최신 props로 새로 mount한다.
snapshot은 활성화 직후 버린다. 이 순서는 DC-04의 활성화 전 입력 보존과 충돌하지 않는다.

현재 큐는 동기 callback을 전제로 한다. 여기에 async loader만 추가하면 프레임·UI 순서와
mounted 판정이 깨질 수 있으므로 다음 책임 분리를 권고한다.

1. 프레임 검증과 요청 generation 확인.
2. reducer에서 state/UI snapshot을 순서대로 갱신.
3. 슬롯별 renderer에 snapshot·revision 전달. 휴면 슬롯의 로드를 강제하지 않음.
4. 유효한 generation/revision의 DOM 반영을 직렬화하고 콘텐츠 반영 후 UI 적용.
5. 플러그인과 trace에 확정된 결과 통지.

View Transition callback 안에서도 유효성을 확인한다. 애니메이션 종료를 기다릴 필요는 없지만
DOM 반영 callback이 지연됐을 때 이전 snapshot이 최신 결과를 덮어쓰지 않아야 한다.
coalesce·backpressure를 재검증하고 accumulate delta를 유실하지 않는다.
제거 후 같은 ID의 재등장과 UI 적용도 원래 연산 순서를 보존한다(V-08/V-09).

## 6. 서버 projection과 응답 계약

### 6.1 코어·액션·wire의 분리

등록 액션 → 권한·입력 검증 → 논리 state 프레임 → 요청 내 reducer → 모드별 projection →
wire 검증 → JSON/NDJSON 구조를 권고한다. 기존 generator는 명시적인 adapter를 사용할 수 있다.
액션이 선택할 슬롯·renderer는 서버 등록 정보로 고정한다. params로 임의 템플릿·HTML을
선택할 수 있게 하지 않는다. 외부 agent 프레임 주입도 공통 validator를 통과한다.

#### 요청 reducer와 server accumulate (DC-10 결정)

- **요청 단위 상태**: 서버의 슬롯 상태 맵은 transition 요청 하나 동안만 존재한다. 다음 요청은 다시 `reset`에서
  시작하고 필요한 데이터는 DB 등 서버 소스에서 다시 읽는다. 세션에 슬롯 상태를 저장하지 않으며 클라이언트가
  보낸 snapshot을 신뢰하지 않는다. 서버가 stateless이므로 Workers·다중 인스턴스에서도 같은 동작이다.
- **reducer**: 작성 층 프레임을 기존 `applyFrame` 규칙(full 교체, partial 병합, removed 삭제, accumulate 누적)으로
  요청 상태에 반영한다. server 슬롯은 반영된 최신 상태로 컴포넌트를 렌더해 `html` op를, client 슬롯은 `props`
  또는 accumulate delta를 `merge` op로 투영한다.
- **혼합 프레임**: 논리 프레임 하나가 server·client 슬롯을 함께 바꾸면 하나의 `patch`에 html op와 props/merge
  op를 함께 담아 브라우저에서 같은 flush에 반영되게 한다.
- **server 렌더 coalesce**: 누적은 매 프레임 반영하되 server 슬롯의 렌더·전송은 묶는다. 슬롯별로 첫 갱신은 즉시,
  이후에는 최대 33ms(클라이언트 프레임 예산과 동일, 설정 가능)에 한 번 렌더하며 `done`·`error` 전에는 대기 중인
  슬롯을 반드시 최종 렌더해 보낸다. client 슬롯 op는 묶지 않고 즉시 보낸다(브라우저 큐가 coalesce).
- **가이드와 dev 경고**: 토큰 스트리밍처럼 길게 쌓이는 영역은 client 모드(`merge` op)를 권장한다. dev에서 한
  요청 동안 server 슬롯 재렌더 횟수나 누적 HTML 크기가 임계치를 넘으면 경고한다(임계치는 DC-14·DC-17에서 확정).
- **렌더 오류**: server 슬롯 렌더가 실패하면 해당 요청에 `error` 프레임을 보내고 종료한다. 복구 규칙은 DC-14다.
- `append` op(목록 끝 HTML 조각)는 후속 확장으로 남긴다(DC-09 확장 후보).

### 6.2 두 층 계약: 작성 프레임과 전송 op (DC-09 결정)

```text
① 작성 층 (개발자 transition이 yield, 사용자 API)
   { type:'state', full|partial(changed·removed)|accumulate, states, ui }
        ↓ 서버: 검증 → 요청 reducer → 슬롯 모드별 투영(server는 HTML 렌더)
② 전송 층 (서버 → 브라우저, 엔진 내부 계약)
   { type:'patch', reset?, ops:[ {slot, html|props|merge|remove|ui} ... ] }
```

- 작성 층은 기존 논리 프레임 모델(full·partial·accumulate·removed·ui)을 유지한다. 외부 agent 입력도
  작성 층으로만 받아 서버 validator를 통과시킨다. 전송 층은 공개 입력 경로가 아니다.
- 전송 층은 슬롯별 op 리스트다. 브라우저 런타임은 병합 규칙을 해석하지 않고 op를 배열 순서대로 실행한다.

```json
{"type":"patch","reset":true,"ops":[
  {"slot":"article:body","html":"<article>…</article>"},
  {"slot":"article:editor","props":{"articleId":"42"}},
  {"slot":"chat:messages","merge":{"items":[{"id":7,"text":"…"}]}},
  {"slot":"ad","remove":true},
  {"slot":"article:body","ui":{"classAdd":["is-new"]}}
]}
{"type":"done"}
{"type":"error","message":"…","slot":"system:error"}
```

| op/필드       | 대상        | 의미                                                                              |
| ------------- | ----------- | --------------------------------------------------------------------------------- |
| `html`        | server 슬롯 | 서버 렌더 HTML 적용. 슬롯의 `swap`(replace/morph, DC-03)을 따른다.                |
| `props`       | client 슬롯 | props 전체 교체. Lithent 갱신. `reset: true`면 인스턴스 재생성(DC-05).            |
| `merge`       | client 슬롯 | accumulate 규칙(배열 concat·문자열 연결·객체 shallow merge·스칼라 교체)으로 누적. |
| `remove`      | 모든 슬롯   | 비활성화·cleanup·UI 제거. 앵커 자체의 수명은 별도.                                |
| `ui`          | 모든 슬롯   | `classAdd`·`classRemove`·`cssVars`·`null`(초기화). 콘텐츠 갱신 후 적용.           |
| `reset: true` | 프레임      | 작성 층 full에 대응. 요청 대상 슬롯 중 이 프레임에 op가 없는 슬롯은 비운다.       |

- **대상 집합**: 요청 대상 슬롯은 서버 등록 정보(액션 targets)로 정하고 첫 `reset` 프레임에서 고정한다.
  op가 대상 밖 슬롯을 가리키면 서버에서 거부한다. 대상 밖과 static 콘텐츠는 유지한다.
- **모드 일치**: `html`은 server 슬롯에만, `props`·`merge`는 client 슬롯에만 허용한다. 한 슬롯에 대한 여러 op는
  순서대로 실행한다(콘텐츠 op 후 `ui`를 권고 순서로 생성).
- **coalesce**: 브라우저 프레임 큐는 슬롯별로 마지막 `html`/`props`만 남기고 그 사이 `merge`는 합친다.
  `remove` 이후의 같은 슬롯 op는 재등장으로 처리한다.
- **확장**: 새 기능은 op 종류 추가로 표현한다. 후속 후보는 `append`(목록 끝 HTML 조각, DC-10), key 반복 슬롯,
  `title`·`redirect`·`flush`다. 모르는 op는 버전 불일치로 간주한다.
- **bootstrap**: `__STATE__`·`__UI__`·`__BOOT__`·`__BASE_PATH__`를 `<script type="application/json"
id="__SURFACE__">` 하나로 통합한다. 내용은 `{ buildId, basePath, slots:[{ id, component, mode, activation,
props }], ui, boot }`이며 실제 렌더된 슬롯만 담는다. server 슬롯은 props 없이 존재·모드만 기록한다.
- **버전**: 브라우저는 transition·라우터·지연 슬롯 요청에 `X-Surface-Build` 헤더로 buildId를 보낸다. 서버의
  buildId와 다르면 409를 응답하고 브라우저는 현재 URL을 문서 로드로 다시 연다. 프레임에는 버전 필드를 두지 않는다.
- **HTML 신뢰 경계**: `html` op는 서버 등록 renderer의 결과만 담는다. 외부 agent가 만든 raw HTML은 작성 층의
  capability 경로(8장)를 거치며 payload의 자기 선언(trusted=true 등)으로 허용하지 않는다.

### 6.3 스트림과 단건

| 상태                         | 허용 전이                                                       |
| ---------------------------- | --------------------------------------------------------------- |
| awaiting-baseline            | `reset` patch → active. error → failed. reset 없는 patch 거부.  |
| active                       | 검증된 patch → active. done → completed. 치명적 error → failed. |
| completed / failed / aborted | 추가 patch 적용 없음. 요청별 cleanup·trace만 수행.              |

- **done 필수**(DC-09 결정): `done` 없이 스트림이 끝나면(EOF) 오류로 처리해 액션을 error로 종료한다. 이미 적용한
  patch는 되돌리지 않는다. done은 승인된 큐의 DOM 반영을 확정한다.
- **빈 성공**: transition이 상태 없이 끝나도 성공이다. 서버는 `done`만 보내고 브라우저는 변경 없이 pending을 해제한다.
- **단건 응답**(DC-09 결정): transition을 async generator로 쓰면 NDJSON 스트림, 일반 async 함수로 쓰면 반환값
  (`{ states, ui }`)을 full + done으로 정규화해 `application/json` 한 번으로 응답한다(`{ frames:[patch, done] }`).
  브라우저는 Content-Type으로 읽고 같은 적용 pipeline을 쓴다.
- **검증·위반 처리**(DC-14 결정): 서버가 정본 검증을 한다.
  - 개발자 transition의 잘못된 작성 프레임: dev에서는 원본 위치와 함께 throw, production에서는 `error` 프레임을 보내고 종료한다.
  - 외부(`external`) 프레임 위반: 그 프레임만 버리고 trace에 기록한 뒤 계속한다(8.1 스키마).
  - 브라우저는 op 구조만 가볍게 재검사한다. `html`·`props`·`merge`·`remove` op 위반은 프로토콜 오류로 보고 적용을
    중단해 액션을 error로 끝낸다. `ui` op 위반은 그 op만 건너뛰고 trace한다.
- **외부 프레임 입구**: 1차 범위에서 외부 프레임용 공개 엔드포인트는 두지 않는다. 외부 소스(agent 등)의 프레임은
  transition 안에서 헬퍼(가칭 `yield* ctx.external(source)`)로만 주입하며, 헬퍼가 `external` 슬롯·스키마·capability를 강제한다.
- **타임아웃**(DC-14 결정): 프레임 사이 대기 **idle 30초**, 요청 **전체 5분**이 기본이다. 기존 전체 30초 단일 한도를
  대체한다. `createHandler`와 transition별로 바꿀 수 있고 플랫폼 한도(Workers 등)가 더 짧으면 그것을 따른다.
  초과 시 `error` 프레임을 보내고 generator를 `return()`으로 멈춘다.
- **크기·개수 한도**(DC-14 결정, 모두 설정 가능):

  | 항목                 | 기본값 | 초과 시                              |
  | -------------------- | ------ | ------------------------------------ |
  | 요청 body            | 100KB  | 413                                  |
  | NDJSON 한 줄(프레임) | 1MB    | 서버 error+종료 / 브라우저 수신 중단 |
  | 한 요청 전송 총량    | 32MB   | 서버 error+종료 / 브라우저 수신 중단 |
  | 한 요청 op 수        | 10,000 | 서버 error+종료                      |
  | `html` op 하나       | 512KB  | 서버 error+종료                      |

  dev에서는 한도의 80%에 도달하면 경고한다. DC-10의 server 재렌더 경고 임계치도 같은 설정에 둔다.

- **실패 복구**(DC-14 결정): 스트림이 중간에 실패해도 이미 적용된 슬롯은 되돌리지 않는다. `error` 프레임의
  오류 슬롯에 메시지를 표시하고 액션 상태를 error로 둔다. 앱은 액션 API의 재시도(같은 transition을 `reset`부터
  다시 실행) 또는 새로고침을 선택한다. 엔진은 자동 재실행하지 않는다(부작용 있는 액션의 중복 실행 방지).
  다음 요청은 항상 `reset`으로 시작하므로 상태는 자연히 재동기화된다.
- 오류 표시는 `error` 프레임의 `slot`이 가리키는 오류 슬롯으로 한정한다. 다른 슬롯을 제거하지 않는다.
- 취소는 대기 큐와 비동기 DOM 반영도 요청 generation으로 무효화한다. 확정된 결과를 자동 rollback하지 않는다.
  모듈 로드 취소와 액션 실행 취소는 별도로 처리한다.

## 7. 컴포넌트 액션과 Pending UI (DC-11 결정)

```tsx
import { useAction } from 'state-surface/client';

const SearchBox = mount((renew, props) => {
  const search = useAction(renew, 'search'); // 상태 가진 핸들
  let q = '';
  return () => (
    <form
      onSubmit={e => {
        e.preventDefault();
        search.run({ q });
      }}
    >
      <input onInput={e => (q = e.target.value)} />
      <button disabled={search.pending}>{search.pending ? '검색 중…' : '검색'}</button>
      {search.error && <p>{search.error.message}</p>}
    </form>
  );
});
```

- **핸들 API**: `useAction(renew, name, options?)`는 `{ run(params), abort(), pending, hasResult, error, aborted }`를
  돌려준다. 상태가 바뀌면 `renew()`로 컴포넌트를 다시 렌더한다. 컴포넌트 unmount 시 진행 중 요청을 abort하지 않고
  핸들 구독만 해제한다. DC-22의 타입 지정 액션이면 params·결과 타입을 서버 정의에서 추론한다.
  함수를 서버 JSON에 직렬화하거나 debug용 `window.__surface`에 의존하지 않는다.
- **`data-action` 유지**: 간단한 서버 조작은 기존 선언형 `data-action`을 그대로 쓴다. 두 경로는 같은 액션
  런타임(요청 ID·동시성·pending)을 공유한다.
- **완료 Promise**: `run()`은 `done`을 받고 활성 슬롯 반영을 마치면 `{ ok: true }`, 실패하면 `{ ok: false, error }`,
  취소되면 `{ ok: false, aborted: true }`로 resolve한다. throw하지 않는다. 휴면 아일랜드의 활성화는 기다리지 않는다.
- **오류 구분**: `error.kind`로 `timeout`·`http`·`protocol`(wire 위반)·`chunk`(아일랜드 로드)·`server`(error 프레임)를
  구분한다. 첫 결과 이후의 실패도 관찰 가능하며 예상 밖 오류는 `reportError`로도 전달한다(8.3).
- **동시성**(DC-11 결정): 같은 이름의 액션이 다시 실행되거나 **대상 슬롯(targets)이 겹치는** 액션이 시작되면
  이전 요청을 abort한다. 대상이 겹치지 않는 액션은 동시에 진행한다(예: 검색 중 좋아요). 액션별로
  `mode: 'queue'`를 선언하면 같은 이름의 요청을 순서대로 실행한다. 기존 전역 abort-previous를 대체한다(AG-08).
  대상 슬롯 정보는 서버 등록 정보에서 빌드 manifest로 내려받는다.
- **pending 표시**: 요청 ID별로 관리한다. 대상 슬롯 앵커의 `data-pending`은 요청 완료(done·error·abort)까지 유지하고
  첫 결과 도착은 `data-has-result`로 표시한다. 이전 요청의 종료 처리가 새 요청의 pending을 해제하지 않는다.
  `data-pending-targets`는 표시 대상만 좁힌다.
- **이벤트 우선순위**: 컴포넌트 핸들러가 `preventDefault()`를 호출한 이벤트에는 `data-action` 위임이 실행되지 않는다.
  한 이벤트에서 액션은 한 번만 실행한다. submit은 submitter의 name·value와 복수 값 필드를 포함해 폼 값을
  이벤트 시점에 snapshot한다(V-13).

## 8. Capability·UI·입력 안전성

mode는 렌더링 위치, capability는 입력에 허용하는 표현이다. server+strict나 client+rich처럼
조합할 수 있으며 서버 registry가 정책의 정본이다. capability는 **transition 프레임으로 슬롯에 동적으로 들어오는
데이터·HTML**에만 적용한다. 개발자가 레이아웃·페이지에 직접 작성한 마크업과 스크립트는 신뢰된 앱 코드다.

### 8.1 슬롯 capability (DC-13 결정)

| capability      | 입력·적용                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| strict (기본)   | 컴포넌트 props 데이터만. renderer는 text·attribute·URL 문맥별로 이스케이프해 출력한다.                                |
| rich            | Markdown·블록을 AST(mdast→hast)로 변환한 뒤 허용 요소·속성·URL scheme(http·https·mailto·상대)만 렌더. raw HTML 차단.  |
| unsafe (opt-in) | raw HTML 허용. `<script>`는 어떤 경우에도 실행하지 않는다. `sandbox="iframe"`이면 sandbox iframe `srcdoc`에 렌더한다. |

- **스키마**: 개발자가 작성한 transition은 신뢰 코드이므로 TS 타입(컴포넌트 props)으로 검사한다. 외부 프레임
  (agent 등)을 받는 슬롯은 `external`과 Standard Schema `schema`를 함께 선언해야 하며, `external` 없는 슬롯에 외부
  프레임이 오면 거부하고 `external`인데 `schema`가 없으면 빌드 오류다. 외부 입력 + unsafe 조합은 dev에서 경고한다.
- **rich 렌더러**: DOM 구현이 필요 없는 AST allowlist 방식이라 Workers에서도 동작하며 콘텐츠 컬렉션(R-24)과 같은
  파이프라인을 쓴다. DOMPurify 같은 출력 후 정화는 사용하지 않는다.
- **승격 금지**: 프레임의 `trusted:true` 같은 자기 선언으로 capability를 올릴 수 없다. 등록 registry가 정본이다.
- **UI 패치 검증**: 클래스는 `[A-Za-z0-9_:/\[\].-]+` 토큰만, `cssVars` 키는 `--`로 시작해야 하며 값에 `;`·`{`·`}`·
  `url(`·`expression(`이 있으면 거부한다. 임의 `style`·이벤트 속성·selector·외부 stylesheet는 받지 않는다.
  현재 잘못된 `ui.classAdd` 타입이 검증을 통과하는 문제를 고친다.
- **SSR 이스케이프**: 텍스트·속성·URL 문맥별로 이스케이프한다. 현재 SSR UI 클래스에 따옴표를 넣으면 속성이
  추가되는 문제를 고친다. `safeStateJSON`의 script 안전성만으로 속성 안전성을 충족했다고 보지 않는다.
- 초기 SSR UI는 base class/style과 결합해 client와 같은 의미를 갖게 한다. UI reset의 원래 값 복원 범위를 검증한다.
- 보호 대상은 외부 상태·UI·agent 프레임이다. 신뢰해서 설치한 임의 JS의 격리나 CSS 변수의 완전한 샌드박스는
  제공하지 않는다. 인증·CSRF·origin 검증은 액션 경계(11.2 미들웨어)에서 처리하고 surface/build ID를 인증 근거로
  사용하지 않는다. 위반 시 skip·중단 규칙과 크기 한도는 DC-14에서 정한다.

### 8.2 서드파티 스크립트 공존 (DC-13 결정)

GTM·광고·픽셀·채팅 위젯·A/B 테스트 도구는 개발자 스니펫 외에도 런타임에 DOM API로 인라인·외부 스크립트,
iframe, 위젯 노드를 head·body에 동적으로 추가한다. 이를 통제할 수 없으므로 **엔진은 자기가 소유한 DOM만 다룬다.**

| 영역                                                       | 소유자   | 엔진 동작                     |
| ---------------------------------------------------------- | -------- | ----------------------------- |
| 슬롯 내부(`<h-state>` 안)                                  | 엔진     | replace·morph·hydration       |
| body의 `<!--ss:body-->`~`<!--/ss:body-->` 사이             | 엔진     | 클라이언트 라우터 교체(10.1)  |
| head의 `<!--ss:head-->`~`<!--/ss:head-->` 사이 관리 태그   | 엔진     | 클라이언트 라우터 병합        |
| 그 밖 전부(서드파티가 추가한 script·iframe·노드·head 태그) | 서드파티 | 읽거나 지우거나 정화하지 않음 |

- **주석 마커**: SSR이 레이아웃 출력의 body·head 내용을 주석 마커로 자동으로 감싼다. DOM 요소가 아니므로 레이아웃
  계층·CSS에 영향이 없고 개발자는 마커를 작성하지 않는다. body 끝·시작에 추가된 서드파티 노드는 마커 밖이라 보존된다.
- **동적 스크립트**: 서드파티가 DOM API로 추가한 스크립트는 브라우저가 평소대로 실행한다. 엔진의 script 미실행
  규칙은 엔진이 슬롯에 넣는 HTML(DC-03)과 unsafe capability에만 해당한다.
- **페이지뷰**: 라우터가 `pushState`를 쓰므로 GTM History Change 트리거가 동작한다. 추가로 `surface:page-load`
  이벤트를 제공하고, 설정 시 `dataLayer.push({ event: 'surface.page_view' })`를 보낸다.
- **한계**: 로드 시 DOM을 한 번만 스캔하는 서드파티는 클라이언트 이동 뒤 새 콘텐츠를 보지 못한다. 그런 페이지·
  레이아웃은 라우터를 쓰지 않거나 링크에 `data-surface-reload`를 붙인다. 서드파티가 슬롯·마커 안 DOM을 바꾸는
  경우(A/B 테스트 등)는 지원하지 않으며 hydration 불일치 시 client 렌더로 대체하고 dev에서 경고한다.
- **CSP**: 엔진은 `unsafe-inline` 없이 동작한다. 요청마다 `ctx.nonce`를 제공하고 엔진이 출력하는 스크립트에 같은
  nonce를 붙인다. `__SURFACE__`는 실행되지 않는 JSON이다. GTM nonce 전파와 `'strict-dynamic'` 조합 가이드를 둔다.
- **슬롯 HTML 안의 임베드 스크립트**(트위터·유튜브 등)는 실행하지 않으므로 클라이언트 플러그인(DC-12)으로 로드하거나
  `capability="unsafe" sandbox="iframe"`으로 격리한다.

### 8.3 외부 SDK·태그 매니저 호환 (R-27, AG-09)

목표는 업체 기본 설치법을 그대로 따랐을 때 동작하는 것이다. 대표 도구가 기대는 지점과 프레임워크의 약속은 다음과 같다.

| 도구(기본 설치)                      | 기대는 것                                                                    | 프레임워크의 약속                                  |
| ------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------- |
| GTM·gtag(head 스니펫)                | head에 스크립트 동적 주입, `pushState` 래핑으로 History Change 감지          | 마커 밖 노드 보존(8.2), 아래 전역 API 규칙         |
| Sentry(npm `Sentry.init`·CDN Loader) | `onerror`·`unhandledrejection`·`fetch`·`history` 래핑, 트레이스 헤더, 소스맵 | 오류 전달, 패치된 전역 API 사용, 헤더 허용, 소스맵 |
| Datadog RUM(npm·CDN 비동기 스니펫)   | `fetch`/XHR 감시, `history` 기반 view, MutationObserver session replay       | 위와 같음, 라우터 이동이 view 변경으로 관측됨      |
| 서버 SDK(`@sentry/node`·dd-trace 등) | 요청 단위 오류·트레이스 수집                                                 | 서버 오류 훅과 미들웨어 연결                       |

1. **앱 클라이언트 엔트리**(DC-18 결정): 규칙 파일 `client/entry.ts`가 있으면(경로는 `surface({ clientEntry })`로 변경 가능) 모든 페이지에서
   엔진 시작 전에 한 번 로드·실행한다. SDK `init` 위치이며 크기는 초기 JS 예산에 앱 코드로 포함해 측정한다.
   클라이언트 라우터 이동에서는 다시 실행하지 않는다. DC-12의 페이지별 플러그인과 별개다.
2. **오류 전달**: transition·hydration·플러그인·아일랜드 로드의 예상 밖 오류는 화면 처리(오류 슬롯) 후
   `reportError()`로 전역 핸들러에 다시 전달한다. 사용자 abort와 abort-previous 취소는 오류로 보내지 않는다.
   trace 훅은 별도로 유지한다.
3. **전역 API 사용 규칙**: 라우터·transition·prefetch는 `history.pushState`·`replaceState`·`fetch`를 호출할 때마다
   전역에서 조회한다. 모듈 로드 시점에 참조를 캐시하지 않아 나중에 로드된 도구의 래핑을 우회하지 않는다.
   이를 단위 테스트로 고정한다.
4. **헤더 관대성**: transition·액션·지연 슬롯·라우터 요청 엔드포인트는 모르는 요청 헤더를 거부하지 않는다.
   응답은 `Server-Timing` 등 표준 헤더와 공존한다.
5. **서버 오류 훅**: `createHandler({ onError(err, ctx) })`를 제공하고 SSR·transition 스트림 중간·액션·지연 슬롯
   오류를 모두 전달한다. 트레이스 컨텍스트는 미들웨어(`onRequest`)에서 연결한다.
6. **소스맵**: production 빌드에 `hidden` 소스맵 생성 옵션을 두고 업로드 가이드를 제공한다(DC-16 소스맵과 동일 원본).
7. **스크립트 순서**: 엔진 스크립트는 `type="module"`(defer 의미)로 출력해 head의 업체 스니펫·로더가 먼저 실행되게 한다.
   엔진은 업체 스니펫보다 먼저 실행되어야 한다는 가정을 하지 않는다.
8. **지표 구분**: static 페이지의 "실행 JS 0바이트"(R-01·NFR-01)는 엔진 기준이며 앱이 추가한 서드파티·앱 엔트리는
   별도 항목으로 기록한다.

## 9. MPA·전환·성능

### 9.1 페이지 전환

이동 방식은 두 가지다. 기본은 문서 로드 이동이고, 선택형 클라이언트 라우터는 10.1에서 정의한다.
문서 로드 이동은 현재 CSS opt-in을 활용하고 필요한 헤더·내비게이션에 view-transition-name을
지정하는 안이다. MPA는 두 문서의 snapshot을 시각적으로 연결하며 동일 DOM·JS 인스턴스를 이어가지 않는다.
필요한 메뉴 상태 등은 명시적인 storage나 서버 상태로 복원하고 비밀 값·전체 props·임의
local state를 자동 저장하지 않는다.

인페이지 startViewTransition은 DOM 반영의 선택 기능으로 두고 고속 스트림에서 매 프레임
애니메이션 여부를 DC-06에서 정한다. 미지원·reduced motion·일반 링크·뒤로/앞으로·BFCache는
V-14에서 검증한다. MPA와 동일 문서 전환의 차이는
[브라우저 공식 설명](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document)을 따른다.

### 9.2 기존 코드의 일괄 전환 (AG-08)

외부 사용자가 없으므로 legacy 경로·shim·deprecation 기간을 두지 않는다. 각 구현 단계는 새 API를
도입하면서 대응하는 구 API를 같은 단계에서 제거하고 데모·scaffold·문서를 함께 전환한다.

| 구 API·구조                                                                   | 대체                                                  | 전환 단계 |
| ----------------------------------------------------------------------------- | ----------------------------------------------------- | --------- |
| Express `createApp`, `req` 기반 route API, `TransitionHooks`                  | `createHandler`·어댑터, `SurfaceContext`, `onRequest` | 1         |
| 문자열 `layout(stateScript)`, `stateSlots`/`joinSurface`, `fillHState` 정규식 | PageDefinition(JSX) + `<Slot>`, 렌더 중 슬롯 처리     | 2         |
| `defineTemplate` 이름 registry, `auto.ts` eager glob                          | componentId registry, 빌드 manifest·동적 청크         | 2~3       |
| 구 StateFrame 의미, `__STATE__`/`__UI__`/`__BOOT__`                           | versioned wire(DC-09), 새 bootstrap                   | 4         |
| 첫 프레임 해제 `data-pending`                                                 | 요청 완료 pending + 첫 결과 상태                      | 5         |
| `shared/content.ts` 가이드 데이터                                             | 콘텐츠 컬렉션                                         | 7         |
| (전용 컴파일러 없음)                                                          | `.tsx` 페이지가 최종 형식(DC-07)                      | —         |

1. 각 단계 종료 시 저장소에 구 API의 import·사용처가 남지 않아야 한다(타입 검사·검색으로 확인).
2. 새 manifest만 사용하므로 eager 번들 비용이 성능 결과에 섞이지 않는다.
3. 지원하지 않는 wire/build version은 호환하지 않고 적용 중단·reload로 처리한다. 배포 버전 불일치
   감지는 호환이 아니라 배포 안전성 기능이다.

BASE_PATH·초기 UI·boot·abort·플러그인·scaffold의 기능 동등성을 전환 검증에 포함한다(V-18).
프로토콜과 공개 API 구현 단계에서 PROTOCOL.md와 공개 guide를 갱신한다.

### 9.3 측정 조건

기존 공통 JS gzip 추정 28.21kB에서 70%를 줄이면 약 8.46kB가 된다. 현재의 단순 환산이며
HTTP 전송 측정이나 새 runtime의 보장값이 아니다.

- home·guide·server 액션·지연 client를 따로 측정한다. 언어 전환·하이라이트 등의 기능을
  보존하고 compression·cache·네트워크·기기를 동일하게 맞춘다.
- 로더 1~2kB는 gzip 기준 후보다. 관찰자·이벤트 수집·metadata 읽기를 포함하고 protocol runtime과
  Lithent는 별도 크기로 기록하되 총 초기 JS에는 모두 합산한다. 최종 예산은 DC-04다.
- JS·HTML/JSON·CSS·실행 시간·SSR 비용·첫 액션 응답까지를 나눠 기록한다.
- INP 200ms 이하, CLS 0.1 이하를 목표 후보로 둔다. 실제 사용자 p75와 lab의 대리 측정을 구분하고
  짧은 테스트를 field INP 합격으로 판정하지 않는다. 환경·첫 액션 예산은 DC-17에서 정한다.
  지표 정의는 [Web Vitals](https://web.dev/articles/vitals)를 참조한다.
- 클라이언트 라우터 이동은 클릭부터 새 페이지 준비 완료까지의 시간을 문서 로드 이동과 같은
  조건에서 비교한다. prefetch 적중·미적중, 반복 이동 후 heap·리스너 수를 함께 기록한다(NFR-04).

## 10. 페이지 이동·로딩·콘텐츠 확장 (Astro 참고)

사용자 합의(AG-06)로 R-17~R-25를 1차 범위에 포함한다. Astro의
[client-side routing](https://docs.astro.build/en/guides/client-side-routing/),
[prefetch](https://docs.astro.build/en/guides/prefetch/),
[server islands](https://docs.astro.build/en/guides/server-islands/),
[actions](https://docs.astro.build/en/guides/actions/),
[styles](https://docs.astro.build/en/guides/styling/),
[on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/),
[content collections](https://docs.astro.build/en/guides/content-collections/),
[images](https://docs.astro.build/en/guides/images/)를 참고하되 StateSurface의 슬롯·프레임 계약으로
재설계한다. 문법·API 호환은 요구하지 않는다. 모든 기능은 opt-in이며 선언이 없으면 기존 동작이다.

### 10.1 선택형 클라이언트 라우터 (R-17)

```text
click / GET submit / popstate
   ↓ 가로채기 판정 (origin·BASE_PATH·opt-out·수정 키·target·download·hash)
before-preparation  (취소 가능, URL·방향·트리거 노출)
   ↓ 진행 중 transition abort, 이전 이동 요청 abort
fetch HTML (prefetch 캐시 우선, Accept: text/html, 이동 요청 헤더)
   ↓ 실패·비 HTML·다른 build ID·opt-out 페이지 → location.assign() 문서 로드
after-preparation
   ↓
before-swap  (교체 함수 대체 가능)
   ↓ startViewTransition(swap) 또는 즉시 swap
     1. 사라지는 슬롯 dispose (Lithent unmount, 플러그인 cleanup, 옵저버 해제)
     2. persist 요소 분리 → head 마커 사이 병합 → body 마커 사이 교체 → persist 요소 재부착
     3. history push/replace, scroll·hash 처리
after-swap
   ↓ discoverAnchors → bootstrap/hydration → 활성화 scheduler → boot transition
page-load  (문서 로드에서도 동일하게 발생)
```

- **runtime 수명 분리**: 현재 `createStateSurface()`는 문서당 1회 실행을 전제로 한다. 이를 문서 수명
  (라우터·액션 위임·로더·플러그인 등록)과 페이지 수명(앵커·인스턴스·bootstrap·boot·옵저버)으로 나누고
  페이지 수명에 `mount(page)` / `dispose()`를 둔다. `bindDeclarativeActions`처럼 `document`에 거는
  리스너는 문서 수명에서 한 번만 등록한다. 플러그인에는 페이지 준비·해제 hook을 추가한다(DC-12/DC-18).
- **교체 범위**(DC-13): `<body>` 전체가 아니라 SSR이 자동 삽입한 `<!--ss:body-->`~`<!--/ss:body-->` 사이 노드만
  교체한다. 래퍼 요소를 두지 않으므로 레이아웃 계층이 바뀌지 않고, 마커 밖의 서드파티 노드는 보존된다(8.2).
- **head 병합**: `<!--ss:head-->` 마커 사이의 관리 태그만 병합한다. title·meta는 새 문서 기준으로 교체하고
  stylesheet·modulepreload는 URL 기준으로 유지·추가하며 새 CSS 로드 완료 후 교체해 FOUC를 막는다. 마커 밖에
  서드파티가 추가한 태그는 건드리지 않는다. `__SURFACE__` bootstrap은 새 문서에서 다시 읽는다.
- **script 정책**: 엔진 엔트리와 이미 실행한 module script는 다시 실행하지 않는다. 새 페이지에만 있는
  module script는 한 번 실행한다. inline script는 기본적으로 다시 실행하지 않고
  `data-surface-rerun`이 붙은 것만 이동마다 실행한다. module script의 판정 키는 해석된 `src` URL이며, 마커 밖에
  서드파티가 추가한 script는 대상이 아니다(DC-18).
- **오류 응답·fallback**(DC-18 결정): 4xx·5xx라도 응답이 라우터를 선언한 레이아웃의 HTML이면 일반 페이지처럼
  교체하고 URL도 갱신한다(문서 로드와 같은 결과). 네트워크 실패, HTML이 아닌 응답, 라우터 없는 페이지(오류 페이지
  포함), build ID 불일치, 리다이렉트로 다른 origin에 도달한 경우는 문서 로드로 넘긴다. View Transition 미지원이면
  애니메이션 없이 교체한다. JS가 없으면 모든 링크가 일반 이동이다.
- **가로채기 범위**(DC-18 결정): 같은 origin·BASE_PATH 안의 `<a>` 클릭과 `method="get"` 폼 제출(쿼리를 붙인 URL로
  이동)을 처리한다. `data-action` 폼·POST 폼(액션 경로, 10.5), `target`·`download`·수정 키 클릭, 해시만 바뀌는 링크,
  `data-surface-reload`가 붙은 링크·폼은 브라우저 기본 동작을 따른다.
- **이벤트**(DC-18 결정): `document`에 `surface:before-preparation`(취소 가능) → `surface:after-preparation` →
  `surface:before-swap`(교체 함수 대체 가능) → `surface:after-swap` → `surface:page-load` 순으로 발생한다.
  `surface:page-load`는 문서 로드에서도 발생한다. payload는 `{ from: URL, to: URL, direction: 'forward'|'back'|'replace',
trigger: 'link'|'form'|'popstate'|'api', signal }`다. 프로그래밍 이동용 `navigate(url, { replace? })`(가칭)을 제공한다.
- **history·scroll**: `history.state`에 이동 ID와 스크롤 위치를 저장하고 `scrollRestoration = 'manual'`로
  복원한다. back/forward는 popstate에서 같은 파이프라인으로 최신 HTML을 다시 받는다(DC-20).
  해시는 교체 후 대상 요소로 스크롤한다. BFCache 복귀(pageshow persisted)와 충돌하지 않게 한다.
- **접근성**: 교체 후 새 `<title>`을 live region으로 announce하고 포커스를 `<main>` 또는 지정 요소로
  이동한다. reduced motion이면 애니메이션 없이 교체한다.
- **상태 연계**: 이동 시작 시 `AbortController`로 이전 이동 fetch와 진행 중 transition을 취소한다. 단 대상이 모두
  persist 슬롯인 액션은 유지한다(10.2, DC-19). (기존
  abort-previous와 같은 generation 모델). 언어 cookie 등 서버 상태는 다음 HTML 요청에 그대로 반영된다.
  POST 폼은 라우터가 가로채지 않고 액션 경로(10.5)로 처리한다.
- **선언 위치**(DC-18 결정): 레이아웃 head에 `<ClientRouter />`를 둔다. 이 컴포넌트를 렌더한 페이지 사이에서만
  클라이언트 이동하고 라우터가 없는 페이지로는 문서 로드로 이동한다. prefetch 기본 전략 등 라우터 옵션은 이
  컴포넌트의 props로 받는다(`<ClientRouter prefetch="hover" />`, DC-20). 라우터 런타임 청크는 이 컴포넌트가 있는
  페이지에서만 로드한다(NFR-04).

### 10.2 persist (R-18, DC-19 결정)

```tsx
// 공통 레이아웃: 직접 지시자 아일랜드
<AudioPlayer client:load transition:persist="player" />

// client Slot은 name이 곧 persist ID
<Slot name="chat:widget" client:idle transition:persist>
  <ChatWidget />
</Slot>
```

- **ID**: 직접 지시자 아일랜드·정적 요소는 `transition:persist="이름"`으로 **명시 이름이 필수**다. client `<Slot>`은
  `transition:persist`만 쓰면 Slot `name`을 ID로 쓴다. 이름 형식은 DC-08 슬롯 이름 규칙을 따르고 페이지 안 중복은
  빌드·SSR 오류다. 이름을 생략한 직접 지시자 persist는 빌드 오류다(자동 ID는 페이지마다 달라 조용히 실패하므로).
- **짝 맞추기**: 교체 전 이전 문서와 새 문서에서 같은 persist ID를 찾는다. 짝이 있으면 이전 DOM 노드를 새 위치로
  옮기고 새 노드는 버린다. 짝이 없으면 일반 dispose한다. componentId가 다르면 persist하지 않고 dev에서 경고한다.
- **props**: 기본은 새 페이지 SSR props를 유지된 인스턴스에 반영한다(로컬 상태는 유지). `resetKey`(DC-05) 값이 바뀌면
  재생성한다. `transition:persist-props`면 이전 props를 유지한다. 플러그인은 `update`를 받는다(DC-12).
- **대상**: client 아일랜드·client Slot·정적 요소(video·audio·iframe 등)를 persist할 수 있다. server 슬롯은 HTML이
  매 페이지 다시 렌더되므로 persist할 수 없고 선언하면 빌드 오류다.
- **진행 중 액션**: 페이지 이동 시 대상 슬롯이 **모두** 새 페이지에서도 유지되는 persist 슬롯인 액션은 abort하지 않고
  스트림을 계속 적용한다(채팅 위젯 응답·업로드 진행률). 사라지는 슬롯이 하나라도 포함된 액션은 이동 시 abort한다.
- **노드 이동**: `moveBefore()`를 지원하면 사용해 iframe·video 재생·포커스 상태를 보존하고, 미지원이면
  `insertBefore`로 대체한다. 이때 iframe 재로드·미디어 일시 정지가 생길 수 있음을 가이드에 명시한다.
- view-transition-name과 persist는 독립이다. persist 요소에도 모핑 애니메이션을 지정할 수 있다.

### 10.3 Prefetch (R-19, DC-20 결정)

| 전략     | 트리거                          | 기본 사용                                |
| -------- | ------------------------------- | ---------------------------------------- |
| hover    | pointerenter·focus 후 65ms 유지 | `<ClientRouter />` 기본값(마우스·키보드) |
| tap      | pointerdown·touchstart          | hover 기본값일 때 터치 입력에 자동 적용  |
| viewport | IntersectionObserver            | 링크별 `data-prefetch="viewport"`로 명시 |
| load     | 페이지 준비 후 idle             | 링크별 `data-prefetch="load"`로 명시     |

- **기본값**: `<ClientRouter prefetch="hover" />`가 기본이며 `prefetch={false}`로 끈다. 링크별
  `data-prefetch="hover|tap|viewport|load|false"`가 우선한다.
- **라우터 있는 페이지**: fetch한 HTML을 탭 메모리 캐시에 넣어 이동에 재사용하고 HTML의 modulepreload·stylesheet도
  미리 요청한다. 캐시는 URL 키 **최대 20개(LRU)**, **TTL 30초**, 이동에 한 번 쓰면 제거한다. transition·폼 액션이
  완료되면 캐시 전체를 비운다(로그인·언어 전환 뒤 오래된 페이지 방지). 모두 `<ClientRouter />` props로 조정한다.
- **라우터 없는 페이지**: Speculation Rules `prefetch`를 쓰고 미지원 시 `<link rel="prefetch">`로 대체한다.
  Speculation Rules `prerender`는 서드파티 스크립트가 미리 실행되는 부작용(8.2) 때문에 명시 opt-in일 때만 쓴다.
- **절약 모드**: `navigator.connection.saveData`이거나 유효 연결이 2G 이하이면 hover·viewport·load 자동 prefetch를
  생략하고 tap만 유지한다.
- **제외 대상**: 다른 origin, POST, `data-surface-reload` 링크는 prefetch하지 않는다. 쿼리로 부작용을 일으킬 수 있는
  URL(로그아웃 등)은 `data-prefetch="false"`로 끄도록 가이드한다. prefetch 요청은 `Sec-Purpose: prefetch` 헤더를
  보내 서버가 구분할 수 있게 한다.
- **back/forward**: 저장한 HTML 스냅샷을 재사용하지 않고 서버에서 최신 HTML을 다시 받아 교체한 뒤 `history.state`에
  저장한 스크롤 위치를 복원한다. HTTP 캐시 헤더는 그대로 존중한다. BFCache로 복귀한 경우(`pageshow` persisted)는
  브라우저 동작을 따른다.

### 10.4 지연 server 슬롯 (R-20, DC-21 결정)

```text
페이지 SSR: <h-state name="cart" data-defer> fallback HTML </h-state> + 암호화된 props 토큰
   ↓ 페이지 응답 즉시 완료 (prerender/CDN 캐시 가능)
브라우저 로더: GET {BASE_PATH}/_surface/island/:componentId?p=<token>   (토큰 2KB 초과 시 POST)
   ↓ 서버: 토큰 복호화·검증 → 쿠키·권한 재확인 → 등록 renderer 실행 → HTML
슬롯 HTML 적용 (server 모드 swap 경로 재사용, DC-03)
```

```tsx
<Slot name="cart" mode="server" server:defer fallback={<CartSkeleton />}>
  <Cart userId={user.id} />
</Slot>

<Slot name="weather" mode="server" server:defer cache="public, max-age=60" fallback={<p>…</p>}>
  <Weather city="Seoul" />
</Slot>
```

- **props 보호**: props는 AES-GCM(Web Crypto)으로 암호화한 토큰으로만 전달한다. 내용이 URL·프록시 로그에 노출되지
  않고 변조하면 복호화가 실패한다. 토큰에는 componentId·slotId·buildId를 함께 넣어 다른 renderer 실행이나 다른
  빌드에서의 재사용을 막는다. 클라이언트는 componentId·props를 바꿀 수 없다.
- **키 관리**: 키는 빌드 시 자동 생성해 서버 번들에 포함한다. `SURFACE_SECRET` 환경 변수가 있으면 그것을 쓰며,
  다중 인스턴스·키 교체 시 설정한다(이전 키를 `SURFACE_SECRET_PREVIOUS`로 함께 두면 교체 기간에 두 키로 복호화).
  같은 키로 DC-22 flash 쿠키도 서명한다. 모든 어댑터에서 Web Crypto로 동작한다.
- **캐시**: 기본 응답은 `Cache-Control: private, no-store`다. 개인화가 아닌 슬롯은 `cache="public, max-age=…"`로 CDN
  캐시를 허용한다. 토큰이 2KB를 넘으면 POST로 자동 전환하며 이때는 캐시되지 않는다.
- **순서**: 지연 응답이 오기 전에 같은 슬롯을 대상으로 한 transition 프레임이 적용되었으면 늦게 온 지연 응답을 버린다
  (revision 비교, 5.3 generation 모델 재사용).
- **실패**: 1초 뒤 한 번 재시도하고 그래도 실패하면 fallback을 유지한 채 `reportError`로 보고한다(8.3).
- **요청 방식**: 같은 페이지의 여러 지연 슬롯은 병렬로 요청한다. 묶음 요청(batching)은 후속 최적화다. 클라이언트
  라우터 이동 시에는 교체 직후 새 페이지의 지연 슬롯을 요청한다. JS가 없으면 fallback이 남으므로 fallback은 의미 있는
  콘텐츠나 안내여야 한다.
- 기존 boot transition과 비교해 지연 슬롯은 슬롯 단위·캐시 가능한 GET·스트림 없음이 차이다. 둘 다 지원하며 선택
  기준을 가이드에 둔다.

### 10.5 타입 지정 transition과 progressive enhancement (R-21, DC-22 결정)

별도 액션 개념을 두지 않고 **transition에 입력 스키마·대상을 선언**한다. 같은 파일 하나가 `data-action`,
`useAction`(DC-11), JS 없는 폼 POST를 모두 처리한다.

```ts
// transitions/comment/add.ts
import { defineTransition } from 'state-surface/server';
import * as z from 'zod';

export default defineTransition({
  input: z.object({ postId: z.string(), body: z.string().min(1) }), // Standard Schema
  targets: ['comments:list'],
  async *handler({ postId, body }, ctx) {
    await db.addComment(postId, body, ctx.locals.user);
    yield {
      type: 'state',
      full: false,
      changed: ['comments:list'],
      states: { 'comments:list': { items: await db.comments(postId) } },
    };
    yield { type: 'done' };
  },
});
```

- **선언 형태**: default export는 `defineTransition({ input?, targets?, mode?, handler })` 또는 기존처럼 generator·async
  함수 자체(입력 검증 없음)다. `targets`는 DC-11 동시성·DC-09 대상 고정의 근거이며 생략하면 handler가 처음
  `reset` 프레임에서 지정한 슬롯이 대상이 된다. `mode: 'queue'`는 DC-11 동시성 옵션이다.
- **스키마**: Standard Schema 인터페이스로 받아 zod·valibot·arktype 등을 쓸 수 있고 엔진은 특정 라이브러리에
  의존하지 않는다. 서버 검증은 필수, 클라이언트 사전 검증은 선택이다. 폼 입력(form-urlencoded·multipart)은 스키마에
  넘기기 전에 객체로 변환한다(같은 이름 다중 값은 배열).
- **검증 실패**: handler를 실행하지 않고 `{ kind: 'validation', fieldErrors }` 오류로 끝낸다. JS 경로에서는
  `useAction` 핸들의 `error.fieldErrors`로, `data-action` 폼에서는 오류 프레임으로 전달된다.
- **JS 없는 폼(PRG)**: `<form method="post" action={actionUrl('comment/add')}>`(가칭 헬퍼, 실제 URL
  `{BASE_PATH}/_surface/action/comment/add`)는 JS 없이도 동작한다. 서버는 transition을 끝까지 실행하고(프레임은
  버림) 원래 페이지(`Referer` 또는 폼의 `_redirect` 필드)로 **303** 리다이렉트한다. 검증 오류·결과·입력값은 서버가
  서명한 일회성 쿠키(flash)로 넘기고 페이지는 `ctx.flash('comment/add')`로 읽어 SSR한다. 새로고침 시 재제출되지 않는다.
  JS가 있으면 액션 위임이 submit을 가로채 transition 스트림으로 실행한다.
- **CSRF**: transition·액션의 모든 POST에서 `Origin`(없으면 `Sec-Fetch-Site`)이 같은 origin인지 검사하고 다르면 403.
  허용 origin 목록을 설정할 수 있다. 토큰이 필요 없어 prerender·CDN 캐시 페이지의 폼과도 호환된다. 세션 쿠키는
  `SameSite=Lax`를 권고한다. 인증 확인은 미들웨어(11.2)·handler에서 한다.
- **클라이언트 타입**: 빌드 플러그인이 `.state-surface/actions.d.ts`에 이름 → 입력·결과 타입 맵을 생성한다(dev에서는
  파일 변경 시 갱신). `useAction(renew, 'comment/add')`의 params가 자동으로 타입 지정되고 없는 이름은 타입 오류다.
  타입만 참조하므로 handler 코드는 client 산출물에 포함되지 않는다(V-05).

### 10.6 scoped CSS (R-22)

- 전용 파일의 `<style>`이 없으므로(DC-07) 컴포넌트 범위 CSS는 **CSS Modules**(`*.module.css`)로 제공한다.
  Vite 기본 기능이라 추가 컴파일러가 없고 클래스 이름이 해시로 범위 지정된다. 전역은 `:global()`로 탈출한다.
  같은 파일에 스타일을 두는 `css` 태그드 템플릿(Vite 플러그인 컴파일)은 후속 선택지로 DC-23에서 검토한다.
- 모듈 클래스 이름은 SSR·server HTML 교체·client 렌더가 같은 CSS 모듈을 import해 얻으므로 런타임 표식이
  필요 없다. 서버와 클라이언트 빌드가 같은 해시 규칙을 쓰는지 검증한다(V-25). 다른 컴포넌트의 모듈 클래스는
  적용되지 않는다.
- CSS는 컴포넌트가 속한 청크의 CSS로 추출한다. static/server 컴포넌트의 CSS는 페이지 CSS로 출력하고,
  클라이언트 이동 시 head 병합(10.1)으로 로드한다. Tailwind 유틸리티와 같은 요소에 함께 쓸 수 있으며
  `@apply` 지원 범위를 정한다. SSR·server HTML·client 렌더 모두 같은 모듈 클래스 이름을 쓰므로 범위가 일치한다.

### 10.7 prerender와 하이브리드 출력 (R-23, DC-24 결정)

```tsx
// routes/[lang]/guide/[slug].tsx
export const prerender = true;

export async function getStaticPaths() {
  const slugs = await listGuideSlugs();
  return ['en', 'ko'].flatMap(lang => slugs.map(slug => ({ lang, slug })));
}

export default async function Page(ctx: SurfaceContext) {
  const { lang, slug } = ctx.params;
  ...
}
```

- **선언**: 기본은 요청 시 SSR이고 페이지가 `export const prerender = true`로 opt-in한다. `surface({ prerender: true })`로
  기본을 뒤집으면 모든 페이지가 prerender되고 페이지가 `prerender = false`로 opt-out한다. 모든 페이지가 prerender이고
  transition·액션·지연 슬롯을 쓰지 않으면 서버 없이 정적 호스팅할 수 있다.
- **동적 라우트**: `getStaticPaths()`가 생성할 params 목록을 돌려준다. prerender 동적 라우트에 이 함수가 없으면
  빌드 오류다. 목록에 없는 params로 요청이 오면 404다.
- **요청 의존 코드 진단**: prerender 중의 `ctx`는 제한 모드다. `ctx.cookies`·`ctx.request` 헤더·`ctx.locals`·`ctx.flash`·
  `ctx.nonce`를 읽으면 원본 위치와 함께 빌드 오류다. 개인화는 지연 슬롯(10.4)으로 분리한다.
- **출력·서빙**: 빌드는 production 서버 번들로 각 경로를 렌더링해 `dist/client/<path>/index.html`로 출력한다. 어댑터는
  정적 파일을 SSR보다 먼저 서빙하고(Workers는 Static Assets) 기본 `Cache-Control: public, max-age=0, must-revalidate`와
  ETag를 붙인다. BASE_PATH는 빌드 시 고정되며 실행 환경 값과 다르면 시작 시 진단한다. CSP nonce가 필요한 페이지는
  prerender할 수 없다(요청별 값).
- **i18n**(DC-24 결정): 언어를 URL에 넣는다(`routes/[lang]/…` → `/en/…`, `/ko/…`). 언어별로 prerender하고 각 페이지에
  `hreflang` 대체 링크를 출력한다. 언어가 없는 경로(`/`, `/guide/x`)는 `lang` 쿠키 → `Accept-Language` → 기본 언어
  순으로 골라 302로 해당 언어 경로에 보낸다. 언어 전환은 같은 페이지의 다른 언어 경로로 이동하며(라우터가 매끄럽게
  처리) 선택값은 쿠키에 기록한다. 데모의 `switch-lang` transition과 쿠키 기반 SSR 언어 선택은 이 방식으로 대체한다(AG-08).
- prerender 페이지의 server/client 슬롯, `data-action` transition, 지연 server 슬롯은 그대로 동작한다.
- **ISR**: 주기적 재생성(증분 재생성)은 1차 범위가 아니다. 자주 바뀌는 페이지는 SSR + `Cache-Control`
  (`s-maxage`, `stale-while-revalidate`)로 CDN에 맡기도록 가이드한다.

### 10.8 콘텐츠 컬렉션 (R-24, DC-25 결정)

```text
content/
  config.ts                     defineCollection({ schema, loader, i18n })
  guides/en/quickstart.md       Markdown + ::: 디렉티브 (기본)
  guides/ko/quickstart.md
  guides/en/live-demo.mdx       컴포넌트·데모 아일랜드가 필요한 문서 (선택)
  pages/en/home.yaml            페이지 UI 문구 데이터
  pages/ko/home.yaml
```

```md
## 설치

:::warning
Node 22 이상이 필요합니다.
:::

:::debug{symptom="화면이 안 바뀜" cause="done 누락"}
transition 끝에 done을 yield하세요.
:::
```

- **위치·구조**: 루트 `content/`와 `content/config.ts`. 경로는 `content/<컬렉션>/<언어>/<id>.<ext>`이며 언어 폴더별 같은
  id가 같은 문서다. i18n을 쓰지 않는 컬렉션은 언어 폴더를 생략한다.
- **loader**: 1차는 `.md`·`.mdx`·`.json`·`.yaml` 파일이다. 원격 CMS loader는 후속이다. 콘텐츠는 빌드·dev에서
  변환해 서버 번들에 포함하므로 Workers에서도 동작하고 client 산출물에는 들어가지 않는다(V-05).
- **조회 API**: `getCollection(name, { lang, filter })`, `getEntry(name, id, { lang })`. 반환 타입은 스키마에서 추론한다.
  Markdown·MDX 항목은 렌더 가능한 `Content` 컴포넌트와 heading 목록(TOC용)을 함께 돌려준다.
- **형식**(DC-25 결정):
  - `.md` + 디렉티브(기본): `remark-directive` 문법(`:::name{attr}`)으로 가이드 블록 10종(paragraph·bullets·code·
    checklist·warning·sequence·diagram·callout·analogy·debug)을 표현한다. 알 수 없는 디렉티브·속성은 빌드 오류다. AST
    allowlist 렌더(8.1 rich)를 쓰고 raw HTML은 차단한다. 외부·CMS 콘텐츠는 이 경로로만 받는다.
  - `.mdx`(선택): 문서 안에 컴포넌트·데모 아일랜드(`<LiveDemo client:visible />`)가 필요할 때 파일 단위로 쓴다.
    `@mdx-js/rollup`을 `jsxImportSource: 'lithent'`로 빌드하며 저장소 안 파일(신뢰된 코드)에만 허용한다. 블록 10종은
    디렉티브와 같은 렌더러를 MDX 컴포넌트로 노출한다. 지시자 분석·서버 전용 검사(DC-02)는 `.mdx`에도 적용된다.
- **i18n parity**(DC-25 결정): 컬렉션에 `i18n: { locales, parity: true }`를 켜면 번역 누락과 구조 불일치를 빌드 오류로,
  dev에서는 경고로 보고한다. `.md`는 섹션 ID·블록 수·블록 타입까지, `.mdx`는 heading 구조까지 비교한다.
- **진단**: 스키마·디렉티브 위반은 파일 경로·필드·줄 번호와 함께 dev 오버레이와 빌드 오류로 보인다. dev에서 콘텐츠 파일이
  바뀌면 해당 페이지를 다시 로드한다.
- **이행**(DC-25 결정): `shared/content.ts`를 전부 옮기고 제거한다(AG-08). 가이드는 `guides` Markdown 컬렉션, 홈·예제
  페이지의 히어로·기능 목록 같은 UI 문구는 언어별 YAML `pages` 데이터 컬렉션으로 옮긴다. 기존 i18n parity 테스트는
  프레임워크 parity 검사로 대체한다. 7단계에서 일괄 전환한다.

### 10.9 이미지 최적화 (R-25)

- `<Image src={import('./hero.png')} alt="..." />`(가칭)는 빌드 시 원본 크기를 읽어 width·height를 출력하고
  `srcset`·`sizes`·WebP/AVIF 변환본을 생성한다. `alt`는 필수이며 장식 이미지는 빈 문자열을 명시한다.
- 기본값은 `loading="lazy"`, `decoding="async"`다. `priority`(가칭)는 eager·`fetchpriority="high"`와 preload를 설정한다.
- 변환 엔진(sharp 등)은 빌드·서버 의존성이며 client 산출물에 포함하지 않는다. dev에서는 요청 시 변환하고
  결과를 캐시한다. 원격 이미지는 허용 도메인 목록에 있을 때만 변환하고, 아니면 진단한다.
- `<Picture>`(가칭, 포맷별 `<source>`)와 배경 이미지 지원은 DC-26에서 범위를 정한다.

## 11. 런타임 중립 서버 코어와 어댑터 (R-26)

사용자 합의(AG-07)로 Express·Node 고정을 풀고 웹 표준 서버 코어와 어댑터 구조를 1차 범위에 포함한다.
Astro·SvelteKit·Remix·Hono가 사용하는 `fetch(Request) → Response` 핸들러 + 어댑터 방식을 따른다.

### 11.1 현재 결합 지점

| 결합                                 | 위치                                                                                                                                                 | 분리 방향                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Express 앱 조립·JSON body·static·404 | [server/index.ts](../../engine/server/index.ts)                                                                                                      | 코어 라우터 + 어댑터의 정적 서빙         |
| `req`/`res` 기반 SSR·NDJSON 쓰기     | [routeHandler.ts](../../engine/server/routeHandler.ts), `index.ts`의 transition                                                                      | `Response` + `ReadableStream` 반환       |
| 사용자 API의 Express `Request` 노출  | [routeModule.ts](../../engine/shared/routeModule.ts), [i18n.ts](../../shared/i18n.ts)                                                                | `SurfaceContext`로 일괄 전환(shim 없음)  |
| 실행 중 fs 스캔·동적 import          | [routeScanner.ts](../../engine/server/routeScanner.ts), [bootstrap.ts](../../engine/server/bootstrap.ts), [assets.ts](../../engine/server/assets.ts) | 빌드 생성 registry·asset manifest import |
| `node:crypto` 동기 sha256            | [ssr.ts](../../engine/server/ssr.ts)                                                                                                                 | Web Crypto `subtle.digest` (async)       |
| `node:http` 종료 처리·logger         | [gracefulShutdown.ts](../../engine/server/gracefulShutdown.ts), [logger.ts](../../engine/server/logger.ts)                                           | Node 어댑터로 이동, logger는 주입        |

### 11.2 코어 계약

```ts
// 가칭
const handler = createHandler({ manifest, basePath, security, bodyLimit, logger, hooks });
const response: Response = await handler.fetch(request, platform);
```

- 코어는 `engine/server/core/`(가칭)에 두고 `node:*`·Express import를 금지한다. lint 규칙과 번들 검사로
  강제한다(V-29). 라우팅은 빌드 manifest의 경로 패턴으로 수행하고 페이지 SSR·`/transition/:name`·
  지연 슬롯(10.4)·액션(10.5)·404를 모두 처리한다. 정적 파일 서빙은 어댑터 책임이다.
- `SurfaceContext`(가칭)를 모든 서버 함수에 **명시적 인자**로 넘긴다(DC-27 결정). 암묵적
  `getContext()`(AsyncLocalStorage)는 제공하지 않는다. 깊은 헬퍼에는 ctx를 인자로 전달한다.

  ```ts
  interface SurfaceContext {
    request: Request;
    url: URL;
    params: Record<string, string>;
    cookies: {
      get(name: string): string | undefined;
      set(name: string, value: string, opts?: CookieOptions): void;
      delete(name: string, opts?: CookieOptions): void;
    };
    locals: App.Locals; // 미들웨어가 채움. 사용자가 declare로 타입 확장
    env: Record<string, string | undefined>; // 어댑터가 주입
    signal: AbortSignal; // 클라이언트 abort + timeout 결합
    platform: unknown; // 어댑터별 원본(Workers ctx 등)
  }
  // 페이지:      initial(ctx), params(ctx), boot.params(ctx)
  // transition:  handler(params, ctx)
  // 액션·지연 슬롯 renderer: (input, ctx)
  // 미들웨어:    onRequest(ctx, next) => Response
  ```

- transition의 두 번째 인자는 기존 `{ signal }`에서 `ctx`로 바뀐다. ctx가 `signal`을 포함하므로
  `options.signal`을 읽는 코드는 그대로 동작한다.
- **cookie 쓰기 시점**(DC-27 결정): 페이지 SSR과 액션은 Response 생성 전까지 언제든 허용한다.
  transition 스트림은 **첫 프레임 yield 전까지** 허용한다. 엔진은 첫 프레임(full baseline)을 받은 뒤
  `Set-Cookie`를 포함한 Response를 만든다. 이후 `ctx.cookies.set`/`delete`는 반영하지 않고 dev에서
  경고와 trace를 남긴다. 첫 프레임 전 오류는 쿠키 없이 오류 응답한다. 이 규칙으로 transition 안에서
  훅 없이 쿠키를 쓸 수 있다(언어 전환은 DC-24에서 경로 이동으로 바뀜).
- **하위 호환 없음**(DC-27 결정): 사용자가 아직 없으므로 Express `req` shim·legacy 어댑터를 두지 않는다.
  `RouteModule`의 `initial(req)`·`params(req)`·`boot.params(req)`, `TransitionHooks`
  (`onBeforeTransition`/`onAfterTransition`), `shared/i18n.ts`의 `getLang(req)`, `routes/_shared/hooks.ts`를
  새 API로 일괄 전환하고 데모 라우트·scaffold·가이드 문서도 같은 단계에서 갱신한다.
- **미들웨어**(DC-27 결정): 양파형 `onRequest(ctx, next) => Response`. `sequence(...)`로 합성하며
  `next()` 전에 조기 `Response`를 반환하거나 `next()` 결과를 가공할 수 있다. 페이지·transition·액션·
  지연 슬롯 요청 모두 통과한다. 요청 종류는 `ctx.route.kind`(가칭)로 구분한다. 보안 헤더·로깅·인증을
  여기서 처리하며 기존 `TransitionHooks`는 제거한다. body 크기 한도는 코어가 스트림을 읽으며 강제한다.
- **env**: `ctx.env`는 어댑터가 주입한다(Node·Bun·Deno는 프로세스 환경, Workers는 binding env).
  코어는 `process.env`를 직접 읽지 않는다. BASE_PATH·NODE_ENV 같은 엔진 설정은 `createHandler` 옵션으로 받는다.
- **locals 타입**: `declare global { namespace App { interface Locals { ... } } }`로 사용자가 확장한다.
- transition 응답은 async generator를 `ReadableStream`으로 감싸 `application/x-ndjson`으로 반환한다.
  `request.signal` abort 시 generator의 `return()`을 호출해 서버 작업을 멈춘다. 기존 timeout·done·
  error 프레임 처리와 trace는 그대로 옮긴다.
- SSR 해시는 Web Crypto로 계산한다. SSR과 클라이언트가 같은 해시를 계산해야 한다.

### 11.3 어댑터 (1차 지원)

| 어댑터             | 진입점·형태                                   | 정적 파일·자산                  | 비고                                          |
| ------------------ | --------------------------------------------- | ------------------------------- | --------------------------------------------- |
| Node 자체 서버     | `node:http` + Request/Response 변환, CLI 실행 | 내장 static 서빙(캐시 헤더)     | 외부 서버 의존성 없음. graceful shutdown 담당 |
| Express 호환       | `app.use(surface())` 미들웨어                 | 사용자 앱 또는 `express.static` | 기존 Express 앱에 장착                        |
| Bun                | `Bun.serve({ fetch })`                        | `Bun.file` 기반 서빙            | Node 어댑터와 같은 결과 검증                  |
| Deno               | `Deno.serve(handler)`                         | `serveDir` 또는 내장            | 권한 플래그(net·read·env) 문서화              |
| Cloudflare Workers | `export default { fetch }`                    | Workers Static Assets           | 파일시스템 없음·CPU 한도. `platform.env` 사용 |

- **패키지 구조**(DC-28 결정): 단일 `state-surface` 패키지에 subpath export로 둔다. 어댑터별 외부 의존성은
  optional peerDependency로 선언하고 해당 어댑터 subpath에서만 import한다. 외부 기여 어댑터가 생기거나
  어댑터의 의존성·릴리스 주기가 코어와 갈라지면 `@state-surface/<adapter>` 별도 패키지로 분리한다.

  ```ts
  // vite.config.ts (가칭)
  import { surface } from 'state-surface/vite';
  import { node } from 'state-surface/adapters/node';
  export default defineConfig({ plugins: [surface({ adapter: node() })] });
  ```

- **기본값**(DC-28 결정): 어댑터를 지정하지 않으면 Node 자체 서버를 사용하고 scaffold 기본값도 같다.
  `express`는 `dependencies`에서 빼고 optional peer로 옮긴다. scaffold는 어댑터 선택지를 제공한다.
- **배포 형식**(DC-28 결정): 원본 `engine/**/*.ts` 배포를 중단하고 컴파일된 ESM JS + `.d.ts` + source map을
  `exports`로 배포한다. 저장소 내부 개발은 기존 tsconfig·Vite alias로 원본을 참조한다. 빌드 도구(tsc/tsup 등)
  선택은 구현 단계에서 정한다.
- **어댑터 계약**: 어댑터는 `{ name, serverEntry, supports: { fs, imageTransform, longStream, ... } }`를
  선언한다. 빌드는 사용 기능과 `supports`를 대조해 미지원 기능을 원본 위치와 함께 빌드 오류로 보고한다.
- **dev·검증**(DC-28 결정): dev는 Node + Vite middleware 단일 경로를 유지하고 코어 핸들러를 Vite dev 서버에
  연결해 dev와 production이 같은 코어를 사용하게 한다. Workers는 production 빌드 산출물을 CI에서
  wrangler dev(workerd)로 실행해 V-28 적합성 테스트를 통과시킨다. Bun·Deno도 각 런타임으로 같은 테스트를 실행한다.

### 11.4 빌드 산출물과 런타임 제약

- 빌드는 route·template·transition·action registry와 asset manifest를 정적 import하는 서버 엔트리를 생성한다.
  어댑터별로 이 엔트리를 감싸는 얇은 파일만 다르다. 실행 중 `readdir`·`fs.readFileSync`를 사용하지 않는다.
- 런타임별 기능 제약 매트릭스를 문서와 진단에 반영한다.

| 기능                 | Node·Express·Bun·Deno | Cloudflare Workers                                          |
| -------------------- | --------------------- | ----------------------------------------------------------- |
| 긴 NDJSON 스트림     | 지원                  | 지원. 요청 시간·CPU 한도 내에서 동작, 한도 문서화           |
| 이미지 변환(R-25)    | 빌드·요청 시 변환     | 빌드 시 변환만. 요청 시 변환은 진단 또는 플랫폼 서비스 위임 |
| 콘텐츠 컬렉션(R-24)  | 빌드 번들             | 빌드 번들(실행 중 파일 읽기 금지)                           |
| 지연 슬롯 서명(R-20) | Web Crypto            | Web Crypto                                                  |
| prerender 서빙(R-23) | 어댑터 static         | Static Assets                                               |

- 요청 간 공유 상태(모듈 전역 캐시)는 Edge에서 isolate마다 다를 수 있다. 정확성이 이에 의존하지 않도록 한다.
- 비 JS 서버의 페이지 SSR은 비목표다. 외부 백엔드가 NDJSON 프레임을 생성하고 코어가 중계하는 구성은
  후속 검토로 남긴다.

## 12. 의사결정 체크리스트

### 12.1 합의한 방향

- [x] AG-01: MPA·명시적 슬롯·NDJSON 스트리밍 유지(R-02/R-08/R-14, V-02/V-08/V-14).
- [x] AG-02: Vite·Lithent 기반 유지(R-03/R-05, V-03/V-05). 서버는 AG-07에 따라 Express 고정에서
      웹 표준 코어 + 어댑터로 바꾸고 Express는 호환 어댑터로 유지한다.
- [x] AG-03: 서버 스크립트·마크업·레이아웃·아일랜드를 한 파일의 자연스러운 트리로 작성(R-11, V-11).
      형식은 async 컴포넌트 `.tsx`로 충족한다(DC-07).
- [x] AG-04: 새 작성 모델의 static 기본값과 client 로컬 UI 상태 공존(R-01/R-12, V-01/V-12).
- [x] AG-05: RSC/Flight·임의 클로저 직렬화·전체 SPA(클라이언트 VDOM 라우터)는 비목표(R-11, V-05/V-11).
      서버 HTML 교체 방식의 선택형 클라이언트 라우터는 이 비목표에 해당하지 않는다(AG-06).
- [x] AG-06 (2026-10-13): Astro 참고 기능을 1차 범위에 포함한다. 선택형 클라이언트 라우터·persist·
      prefetch·지연 server 슬롯·타입 지정 액션·scoped CSS·prerender·콘텐츠 컬렉션·이미지 최적화
      (R-17~R-25, NFR-04, V-19~V-27). 모두 opt-in이고 기본 이동은 문서 로드로 유지한다.
- [x] AG-07 (2026-10-13): 런타임 중립 서버 코어(`Request → Response`)와 1차 지원 어댑터 Node 자체 서버·
      Express 호환·Bun·Deno·Cloudflare Workers를 1차 범위에 포함한다(R-26, NFR-05, V-28/V-29).
- [x] AG-08 (2026-10-13): 외부 사용자가 없는 0.x 단계이므로 2.0 전체에서 하위 호환을 고려하지 않는다.
      legacy 경로·shim·deprecation 기간 없이 구 API를 새 모델로 일괄 전환하고 데모·scaffold·문서를 함께
      바꾼다(NFR-02, DC-15, 9.2, V-18).
- [x] AG-09 (2026-10-14): GTM·Sentry·Datadog 등 외부 SDK·태그 매니저는 업체 기본 설치법 그대로 문서 로드·클라이언트
      이동 모두에서 동작해야 한다(R-27, 8.3, V-31).

### 12.2 구현 방식: 전 항목 TBD, 아래는 권고안

- [x] DC-01 (2026-10-13 결정): Slot API·직접 컴포넌트 지시자. ① 서버 갱신 경계는 `<Slot>`, 독립 아일랜드는
      직접 지시자, 둘 다 같은 SlotDefinition으로 정규화 ② `<Slot>` 자식은 컴포넌트 엘리먼트 1개, 그 props가
      슬롯 상태(Astro식 props 전달) ③ `<Slot name>` 필수, 직접 지시자는 자동 ID이며 프레임 대상 불가
      ④ fallback은 `fallback` prop. 근거: transition이 겨냥할 이름 붙은 경계는 필수이고, props=상태로 JSX 타입
      검사를 그대로 쓰며, 작은 아일랜드의 이름 부담을 없앤다. 2.1. V-11/V-15/V-18.
- [x] DC-02 (2026-10-14 결정): 선언 분석·Vite 가상 모듈. ① `oxc-parser`로 원본 TSX를 pre transform에서 분석
      ② 아일랜드는 정적 import 식별자만 허용, 계산된 컴포넌트는 빌드 오류(명시 registry 없음) ③ 컴포넌트별
      동적 청크 + 공유 의존 공통 청크, `virtual:state-surface/islands` loader 맵 ④ `state-surface/server-only`
      마커·`*.server.ts`·`node:*`가 client 전이 의존성에 들어오면 경로 체인과 함께 빌드 실패, sentinel 스캔으로
      교차 확인 ⑤ eager glob 제거, dev/build 동일 manifest. 근거: 빌드에서 아일랜드를 모두 확정해 진단·preload·
      보안 검사가 단순하고, 지연 활성화와 페이지 간 캐시에 유리하며 Astro와 같은 제약이다. 3장. V-05/V-16.
- [x] DC-03 (2026-10-14 결정): server HTML 적용. ① 기본 `swap="replace"`(내부 HTML 통째 교체, 플러그인
      cleanup·아일랜드 dispose/재활성화) ② replace 시 `id` 기반 포커스·선택·스크롤 best-effort 복원 ③ 슬롯별
      opt-in `swap="morph"`는 idiomorph(버전 고정, 해당 페이지에서만 로드) ④ 적용 HTML의 `<script>` 미실행.
      근거: server 페이지 기본 JS를 최소로 유지하면서 입력 보존이 필요한 슬롯만 검증된 morph를 쓴다.
      브라우저는 병합 없이 HTML만 적용한다(서버 측 병합 방식은 DC-10). 4.3. V-02/V-12/V-15.
- [x] DC-04 (2026-10-14 결정): 로더·시점·첫 이벤트. ① idle=rIC(2초)/미지원 시 load+200ms, visible=rootMargin 200px,
      media=matchMedia, 미지원 시 idle ② only 단독=load, 시점 조합 허용·fallback 표시, 다중 시점은 빌드 오류
      ③ 활성화 전 pointerdown·focusin·keydown 감지 시 즉시 활성화, SSR DOM 재사용으로 입력값 보존, 클릭 재생 없음
      ④ 청크 실패는 1회 재시도 후 SSR 유지·reportError ⑤ `client:load`만 modulepreload ⑥ 로더 gzip 2KB는 목표·보고
      (CI 강제 없음) ⑦ data-action 첫 click/submit은 로더가 잡아 폼 snapshot 후 1회 실행. 근거: 지연 활성화의 이득을
      지키면서 첫 입력 유실을 막고, 일시 오류에도 SSR 화면을 유지한다. 5.2. V-04/V-06/V-13/V-17.
- [x] DC-05 (2026-10-14 결정): 로컬 상태·SSR snapshot. ① 같은 slotId·componentId의 props 갱신은 DataProxy 재사용으로
      로컬 상태 유지 ② Slot `resetKey`(기준 prop 이름) 값이 바뀌면 자동 재생성 ③ transition 작성 프레임 `reset:[slotId]`로
      명시 초기화, 전송 층은 props op의 `reset` 플래그 ④ 휴면 중 갱신은 SSR snapshot으로 hydrate 후 최신 props 적용,
      휴면 중 reset이면 새 mount, snapshot은 활성화 후 폐기. 근거: 같은 대상의 갱신에서는 입력 초안을 지키고 대상이
      바뀌면 섞이지 않게 하며, hydration 불일치 없이 최신 상태에 도달한다. 5.3. V-03/V-04/V-12.
- [ ] DC-06: MPA·인페이지 전환. CSS opt-in 유지·명시적 상태 복원·고속 스트림 애니메이션 억제안.
      브라우저·reduced motion 범위를 정한다. V-08/V-14.
- [x] DC-07 (2026-10-14 결정): 페이지 파일 형식·컴파일러. ① 전용 확장자(.surface) 없이 async 컴포넌트
      `.tsx`가 최종 형식 ② `default export async (ctx) => JSX`, 페이지 옵션은 named export(`definePage` 미사용)
      ③ 요청 컨텍스트 이름은 `ctx`(DC-27과 동일) ④ 전용 컴파일러 대신 Vite 플러그인이 Slot·지시자 분석·진단·
      manifest를 담당 ⑤ scoped CSS는 CSS Modules ⑥ namespaced 지시자의 esbuild 통과를 2단계 spike로 확인.
      근거: 전용 형식은 문법·언어 서버·포매터·린터 도구를 별도로 개발·유지해야 하고, async `.tsx`가 AG-03을
      그대로 충족하며 기존 TS 도구를 모두 쓴다. 2.1/2.2. V-11/V-16.
      parser·서버 context·CSS 범위·공개 entry와 최종 문법을 결정한다. V-05/V-11/V-16.
- [x] DC-08 (2026-10-13 결정): slotId/componentId·동적 ID·children·중첩. ① 이름은
      `[a-z0-9-]+(:[a-z0-9-]+)*` 리터럴, 페이지 단위 단일 구역, `#` 예약 ② 반복 아일랜드·`server:defer`는
      Astro처럼 루프 허용(자동 ID), transition 대상 Slot은 정적 이름만, key 반복 Slot은 후속 ③ Slot-in-Slot
      금지, server 슬롯 안 아일랜드는 부모 교체 시 재생성(로컬 상태 초기화) ④ client 아일랜드 children은
      서버 렌더 정적 HTML로 전달 ⑤ componentId는 모듈 경로+export 이름. 근거: 갱신 대상을 빌드에서 모두
      알 수 있어 진단·권한·타입 검사가 단순하고, Astro 사용 경험을 유지하며, 상태 보존 중첩의 비용을
      후속으로 미룬다. 4.3. V-12/V-15/V-16.
- [x] DC-09 (2026-10-14 결정): wire 계약. ① 두 층 분리: 작성 층은 기존 논리 프레임(full·partial·accumulate·
      removed·ui) 유지, 전송 층은 `patch` 슬롯별 op 리스트(`html`·`props`·`merge`·`remove`·`ui`, `reset`=full)
      ② bootstrap은 `__SURFACE__` JSON 하나로 통합 ③ 버전은 `X-Surface-Build` 헤더 검사 → 409 → 문서 재로드,
      프레임에 버전 필드 없음 ④ `done` 필수, done 없는 EOF는 오류 ⑤ async generator=NDJSON, async 함수=JSON 단건
      자동 정규화 ⑥ 빈 성공 허용. 근거: 서버가 병합·투영을 끝내므로 브라우저는 op 실행만 하면 되어 런타임이 작고,
      혼합 모드 교차 규칙이 없으며, 검증·coalesce·확장이 op 단위로 단순하다. 6.2/6.3. V-02/V-07/V-08/V-18.
- [x] DC-10 (2026-10-14 결정): server accumulate. ① 슬롯 상태는 요청 하나 동안만(세션 저장 없음, 다음 요청은
      reset부터) ② 요청 reducer는 기존 applyFrame 규칙, server 슬롯은 최신 상태로 렌더해 html op, client는 props/merge
      op ③ 혼합 프레임은 patch 하나로 ④ server 렌더는 슬롯별 첫 갱신 즉시·이후 최대 33ms 1회·done/error 전 최종 렌더
      ⑤ 고빈도 누적은 client 모드 권장 + dev 경고 ⑥ append op는 후속. 근거: stateless 서버로 런타임 이식성을
      유지하고, 실수로 server 슬롯에 토큰을 흘려도 렌더 비용을 제한한다. 6.1. V-02/V-07/V-08.
- [x] DC-11 (2026-10-14 결정): 컴포넌트 액션·pending·취소. ① `useAction(renew, name)` 상태 핸들(pending·hasResult·
      error·aborted, 변경 시 renew), `run()`은 throw 없는 결과 Promise ② `data-action`과 같은 런타임 공유 ③ 동시성은 같은
      이름·겹치는 targets만 abort, 나머지는 병렬, 액션별 `mode:'queue'` 선택 ④ `data-pending`은 완료까지, 첫 결과는
      `data-has-result` ⑤ `error.kind`로 오류 구분, reportError 전달 ⑥ preventDefault 시 위임 생략·1회 실행·submitter 포함
      snapshot. 근거: 보일러플레이트 없이 pending UI를 만들고, 무관한 액션이 서로 취소하지 않게 한다. 7장. V-04/V-08/V-13/V-18.
- [x] DC-12 (2026-10-14 결정): 플러그인 선언·지연 lifecycle. ① 페이지·레이아웃 `export const plugins`, 플러그인별
      청크로 선언 페이지에서만 로드(전역 설정 없음) ② `definePlugin({ slots, load, attach→cleanup, update })`,
      replace는 cleanup→attach, morph·client 갱신은 update, 제거·페이지 이동은 cleanup ③ 기본 `idle` 로드,
      로드 시 이미 표시된 대상 슬롯에 즉시 attach ④ 서버에서 가능한 보강(Prism)은 서버 우선 권고 ⑤ 플러그인은
      아일랜드 내부 DOM을 수정하지 않음. 근거: 모든 모드·라우터에 하나의 수명 규칙, 정리 누락 방지, 페이지별 JS
      최소화. 5.1. V-02/V-06/V-15/V-18.
- [x] DC-13 (2026-10-14 결정): schema·capability·HTML 안전성. ① 타입 기본, `external` 슬롯만 Standard Schema
      필수 ② rich는 AST allowlist 렌더(raw HTML 차단, DOM 불필요) ③ unsafe는 opt-in, script 미실행, `sandbox="iframe"`
      선택 ④ capability 승격 금지, UI 토큰·cssVars 값 검증, SSR 문맥별 이스케이프(기존 결함 수정) ⑤ 서드파티 공존:
      엔진은 슬롯·`<!--ss:body-->`/`<!--ss:head-->` 주석 마커 사이만 다루고 나머지 DOM은 건드리지 않음, 페이지뷰는
      History Change + `surface:page-load`, CSP nonce 지원. 근거: 외부 입력만 엄격히 막고 신뢰 코드는 타입으로,
      GTM 등 동적 주입을 통제하지 않고도 공존하며 레이아웃 계층을 바꾸지 않는다. 8장. V-09/V-10/V-15/V-30.
- [x] DC-14 (2026-10-14 결정): validator·한도·복구. ① 서버 정본 검증: 개발자 프레임 위반은 dev throw/prod error+종료,
      external 위반은 그 프레임만 drop+trace ② 브라우저: 콘텐츠 op 위반은 적용 중단, ui op 위반은 skip+trace
      ③ 타임아웃 idle 30초·전체 5분 ④ 한도 body 100KB·한 줄 1MB·총 32MB·op 1만·html op 512KB(설정 가능, dev 80% 경고)
      ⑤ 실패 시 적용분 유지·오류 슬롯·액션 error, 재시도 API 제공, 자동 재실행 없음 ⑥ 외부 프레임은 transition 안
      헬퍼로만 주입(공개 엔드포인트 없음). 근거: 신뢰 코드의 실수는 빨리 드러내고 외부 입력은 국소 차단하며, 긴 LLM
      스트림을 허용하면서 메모리 폭주와 중복 부작용을 막는다. 6.3. V-08/V-09/V-10.
- [x] DC-15 (2026-10-13 결정): 전환 범위·기본값. legacy adapter·shim·지원 기간 없이 새 모델을 유일한
      모델로 하고 구 API는 단계별로 제거한다(AG-08, 9.2). 근거: 외부 사용자가 없는 0.x 단계에서 호환 계층의
      설계·번들·테스트 비용이 이득보다 크다. V-01/V-08/V-18.
- [x] DC-16 (2026-10-14 결정): 진단·편집기·dev/prod·scaffold. ① 진단 3단: 타입(에디터) → Vite 오버레이·빌드
      실패(파일:줄:열·코드 프레임·힌트) → `state-surface check` CLI, ESLint 플러그인은 1차 제외 ② 라우트는
      `routes/**/*.tsx`에서 `_` 파일·폴더 제외, URL 충돌·default export 누락은 빌드 오류 ③ transition은 루트
      `transitions/**/*.ts` 자동 등록(경로 = 이름) ④ dev/prod가 같은 분석 함수를 쓰고 V-28을 양쪽에 실행 ⑤ scaffold는
      최소 스타터 기본 + `--template demo`, 어댑터 프롬프트, CI에서 생성·빌드·테스트. 근거: 규칙 구현을 한 곳으로
      모으고, Astro식 탐색 규칙과 공유 가능한 transition 위치, 새 사용자의 시작 비용 최소화. 3.1. V-05/V-11/V-16/V-18.
- [ ] DC-17: 초기 JS·응답·실행 시간·INP/CLS·첫 액션. 대표 페이지·환경·통과 수치를 고정해
      NFR-01의 70% 감소와 사용 경험을 함께 판정한다. 클라이언트 이동 지연·반복 이동 메모리(NFR-04)도
      같은 조건에서 고정한다. V-17/V-19.
- [x] DC-18 (2026-10-14 결정): 클라이언트 라우터. ① 레이아웃 head `<ClientRouter />`로 opt-in, 옵션은 props, 런타임은
      해당 페이지만 로드 ② 라우터 있는 레이아웃의 HTML 오류 페이지(4xx·5xx)는 교체, 네트워크 실패·비 HTML·라우터 없는
      페이지·build ID 불일치·다른 origin은 문서 로드 ③ 같은 origin 링크와 GET 폼 가로채기, data-action·POST 폼·
      `data-surface-reload` 제외 ④ 이벤트 `surface:before-preparation`→`after-preparation`→`before-swap`→`after-swap`→
      `page-load`, payload `{from,to,direction,trigger,signal}`, `navigate()` API ⑤ inline script는 `data-surface-rerun`만
      재실행, module script는 src URL 기준 1회 ⑥ 앱 엔트리는 규칙 파일 `client/entry.ts`. 근거: Astro와 같은 사용 경험,
      오류 페이지에서도 매끄러운 이동, 검색 폼 등 일반 패턴 지원, SDK init 위치의 단순한 규칙. 10.1·8.3. V-19/V-20/V-31.
- [x] DC-19 (2026-10-14 결정): persist. ① 명시 이름 필수(`transition:persist="이름"`), client Slot은 name이 ID, 생략·중복은
      빌드 오류 ② 새 페이지 props 기본 반영, `transition:persist-props`로 유지, resetKey 변경 시 재생성 ③ client 아일랜드·
      client Slot·정적 요소 허용, server 슬롯 금지 ④ 대상이 모두 persist인 진행 중 액션은 이동 후에도 유지, 그 외 abort
      ⑤ `moveBefore()` 우선, 미지원 시 insertBefore(iframe 재로드 가능 명시). 근거: 페이지마다 다른 위치에서도 확실히
      짝이 맞고, 채팅 위젯 같은 핵심 사례의 스트림이 이동으로 끊기지 않는다. 10.2. V-21.
- [x] DC-20 (2026-10-14 결정): prefetch. ① 라우터 기본 hover(65ms), 터치는 tap, viewport·load는 링크별 opt-in ② 메모리 캐시
      최대 20개 LRU·TTL 30초·1회 사용 후 제거·액션 완료 시 전체 비움 ③ 라우터 없는 페이지는 Speculation Rules prefetch(미지원 시
      link prefetch), prerender는 opt-in ④ Save-Data·2G 이하는 tap만 ⑤ back/forward는 최신 HTML 재요청 + 스크롤 복원
      ⑥ 다른 origin·POST·reload 링크 제외, `Sec-Purpose: prefetch` 헤더. 근거: 체감 속도 이득이 크면서 낭비가 적고, 로그인·
      언어 전환 뒤 오래된 화면을 보이지 않는다. 10.3. V-22.
- [x] DC-21 (2026-10-14 결정): 지연 server 슬롯. ① props는 AES-GCM 암호화 토큰(componentId·slotId·buildId 포함)
      ② 키는 빌드 자동 생성, `SURFACE_SECRET`(+`_PREVIOUS`)로 교체, flash 쿠키와 공유 ③ 기본 `private, no-store`, 슬롯별
      `cache="public, …"` opt-in, 토큰 2KB 초과 시 POST ④ 선행 transition이 있으면 지연 응답 폐기 ⑤ 1회 재시도 후 fallback
      유지·reportError ⑥ 병렬 요청, 라우터 이동 후 즉시 요청. 근거: 개인정보가 URL에 노출되지 않고, 개인화 응답이 공유
      캐시에 남지 않으며, 공용 슬롯은 CDN 이득을 얻는다. 10.4. V-23.
- [x] DC-22 (2026-10-14 결정): 타입 지정 액션. ① 별도 액션 개념 없이 `defineTransition({ input, targets, mode, handler })`로
      통합(`actions/` 디렉터리 없음) ② Standard Schema, 검증 실패는 handler 미실행·`validation` fieldErrors ③ JS 없는 폼은
      `/_surface/action/:name` POST → 실행 → 303 + 서명된 flash 쿠키, 페이지는 `ctx.flash()` ④ CSRF는 Origin·Sec-Fetch-Site
      검사 기본 ⑤ 빌드가 `.state-surface/actions.d.ts` 타입 맵 생성. 근거: 개념 하나로 세 호출 경로를 지원하고,
      새로고침 재제출 없는 PRG, 캐시 페이지와 호환되는 토큰 없는 CSRF, 서버 코드 없는 타입 안전성. 10.5. V-24.
- [ ] DC-23: scoped CSS. CSS Modules 기본(DC-07에서 확정). 같은 파일 `css` 태그드 템플릿의 후속 도입 여부,
      Tailwind `@apply` 범위와 CSS 청크 배치를 정한다. V-25.
- [x] DC-24 (2026-10-14 결정): prerender. ① 기본 SSR, 페이지 `export const prerender = true`, `surface({ prerender: true })`로
      기본 반전 ② 동적 라우트는 `getStaticPaths()` 필수 ③ 제한 ctx로 요청 의존 코드는 빌드 오류 ④ 정적 파일 우선 서빙,
      BASE_PATH 빌드 고정 ⑤ i18n은 언어별 경로 `/en/…`·`/ko/…`(hreflang, 언어 없는 경로는 쿠키·Accept-Language로 302,
      전환은 경로 이동) ⑥ ISR 제외. 근거: 언어별 정적 HTML과 SEO·CDN 캐시를 함께 얻고, 기존 SSR 기본 동작을 유지한다.
      10.7. V-26.
- [x] DC-25 (2026-10-14 결정): 콘텐츠 컬렉션. ① `content/<컬렉션>/<언어>/<id>`, `content/config.ts` ② loader는 md·mdx·json·yaml
      (CMS 후속) ③ `.md` + `:::` 디렉티브 기본(블록 10종 매핑, rich 렌더, 외부 콘텐츠 경로), `.mdx`는 데모·컴포넌트가 필요한
      저장소 문서에 선택(@mdx-js/rollup + lithent) ④ i18n parity는 빌드 오류(dev 경고), md는 블록 수준·mdx는 heading 수준
      ⑤ `shared/content.ts` 전부 이행(가이드=md, UI 문구=yaml) 후 제거. 근거: 정형 문서는 엄격하고 안전하게, 데모가 필요한
      문서는 MDX의 표현력을 쓰며, 현재 테스트 수준의 번역 보장을 프레임워크 기능으로 옮긴다. 10.8. V-27.
- [ ] DC-26: 이미지. 변환 엔진·포맷·srcset 폭 목록·dev 캐시 위치·원격 허용 목록·`<Picture>`와
      배경 이미지 범위를 정한다. V-27.
- [x] DC-27 (2026-10-13 결정): 요청 컨텍스트·코어 API. ① 모든 서버 함수에 명시적 `ctx` 인자
      (암묵적 getContext 미제공) ② transition 쿠키 쓰기는 첫 프레임 yield 전까지, 이후는 dev 경고 후 무시
      ③ 양파형 `onRequest(ctx, next)` 미들웨어, `TransitionHooks` 제거 ④ 사용자 없음 → Express `req` shim·
      legacy 어댑터 없이 일괄 전환 ⑤ `ctx.env` 어댑터 주입, `App.Locals` 타입 확장. 근거: 런타임 간 동일 동작과
      테스트 용이성, 스트림 헤더 확정 시점과 full baseline 규칙의 일치, 0.x 단계의 이행 비용 최소화. 11.2. V-28.
- [x] DC-28 (2026-10-13 결정): 어댑터 패키징·기본값. ① 단일 `state-surface` 패키지의 subpath
      (`state-surface/adapters/{node,express,bun,deno,cloudflare}`)로 시작하고, 외부 기여 어댑터가 생기거나
      어댑터 의존성·릴리스 주기가 코어와 갈라질 때 별도 패키지로 분리한다 ② 기본 어댑터는 Node 자체 서버,
      `express`는 optional peerDependency ③ 배포물은 컴파일된 ESM JS + `.d.ts`(원본 TS 배포 중단)
      ④ Workers는 production 빌드 산출물을 CI에서 wrangler dev(workerd)로 적합성 검증, dev는 Node + Vite 단일
      경로 ⑤ 어댑터는 Vite 플러그인 설정에서 선택하고, 지원하지 않는 기능 사용은 빌드 실패로 진단한다.
      근거: 0.x에서 버전·배포 단위를 하나로 유지, 기본 설치 의존성 최소화, Vite 밖 런타임(Node·Deno·테스트
      러너)에서의 실행 안정성, dev 서버 단순성. 11.3. V-29.

기존 아이디어 문서의 미결정 항목도 이어받는다. 이전 DC-01은 DC-01/DC-15, DC-02는 DC-02/DC-08,
DC-03은 DC-03/DC-08, DC-04는 DC-09, DC-05는 DC-10, DC-06/DC-07은 DC-04/DC-11,
DC-08은 DC-05, DC-09는 DC-11, DC-10은 DC-09, DC-11은 DC-12, DC-12는 DC-17로 대응한다.
이전 번호는 docs/idea/DESIGN.md의 번호이며 문서 간 같은 번호를 혼동하지 않는다.

## 13. 검증 매트릭스

후속 IMPLEMENT.md·MANUAL_TEST_CHECKLIST.md의 입력이며 실행된 결과가 아니다.

| ID   | 대상           | 시나리오와 통과 기준                                                                                                                                                                                                 |
| ---- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-01 | R-01           | static에 프레임을 보내도 콘텐츠 유지. action/boot/plugin 없는 페이지는 실행 JS 요청 0건.                                                                                                                             |
| V-02 | R-02           | server SSR·업데이트 HTML 일치. 단건/스트림·언어 전환·제거 처리, client 템플릿 배제.                                                                                                                                  |
| V-03 | R-03           | 복수 아일랜드의 독립 hydrate/mount/unmount. 같은 컴포넌트의 인스턴스끼리 간섭 없음.                                                                                                                                  |
| V-04 | R-04/R-12      | timing·only·fallback·청크 실패, 휴면 delta·제거 후 load·첫 입력. 유실 없이 최신 상태 반영.                                                                                                                           |
| V-05 | R-01/R-05/R-11 | 전체 client 산출물에 static/server 전용 모듈·비밀 sentinel 없음. 필요한 컴포넌트·CSS만 로드.                                                                                                                         |
| V-06 | R-06           | 페이지별 불필요한 plugin/debug 로딩 없음. client 아일랜드 없는 페이지에서 Lithent 배제.                                                                                                                              |
| V-07 | R-07           | JSON/NDJSON 최종 DOM·state·UI 일치. async handler·실패·빈 결과·Content-Type 규약 준수.                                                                                                                               |
| V-08 | R-08/R-02      | partial/accumulate first·done 후·깨진 JSON·누락 delta·EOF·한도·취소·병합 순서에 잘못 적용하지 않음.                                                                                                                  |
| V-09 | R-09           | UI-only에서 renderer 미호출. full/partial/null/removed와 SSR/hydration 일치, reset·원래 값 처리 검증.                                                                                                                |
| V-10 | R-10/NFR-03    | SSR 속성 breakout·script/event URL·악성 rich·capability 승격·UI 타입 위반을 방어하고 허용 밖 적용 차단.                                                                                                              |
| V-11 | R-11           | `.tsx` 페이지의 layout·조건·반복·slot SSR·metadata 일치. 병렬 요청 사이 데이터 유출 없음.                                                                                                                            |
| V-12 | R-12           | props 갱신 때 local draft/toggle·유지된 입력 focus 보존. reset·record 교체·제거는 정의된 수명 준수.                                                                                                                  |
| V-13 | R-13           | 첫 submit 값·submitter 유지와 단일 실행. 첫 결과 이후 pending·연속 요청·실패·취소 상태 정확.                                                                                                                         |
| V-14 | R-14           | MPA·일반 링크·뒤로/앞으로·미지원·reduced motion. 선택한 값만 복원, 스트림 DOM 순서 보존.                                                                                                                             |
| V-15 | R-15           | 중복 ID·컴포넌트 재사용·미등록/권한 밖 슬롯·부모자식 소유권. 미지원 중첩 진단 또는 검증된 보존·cleanup.                                                                                                              |
| V-16 | R-16           | import 경계·비 JSON props·지시자·URL 충돌의 원본 진단. dev/prod CSS·소스맵·지시자 변환 일치.                                                                                                                         |
| V-17 | NFR-01         | 고정 조건에서 총 초기 gzip JS 70% 감소. HTML/JSON/SSR·첫 액션·INP/CLS가 결정된 예산 충족.                                                                                                                            |
| V-18 | NFR-02         | 전환 후 데모 전 페이지의 언어 전환·boot·abort·스트리밍·UI·액션·BASE_PATH·plugin 동등, 생성 scaffold 동작, 구 API 사용처 0, 버전 불일치 reload.                                                                       |
| V-19 | R-17/NFR-04    | 링크·GET 폼·뒤로/앞으로 이동 후 DOM·state·boot·action이 문서 로드와 동일. 100회 이동 후 리스너·인스턴스 누적 없음.                                                                                                   |
| V-20 | R-17           | 진행 중 스트림 abort, head 병합·CSS 선로드, script 1회 실행, opt-out·외부·수정 키·오류·build ID 불일치 fallback, scroll·hash·focus·announce.                                                                         |
| V-21 | R-18           | persist 아일랜드의 로컬 상태·포커스·재생 유지와 새 props 반영/유지 옵션. 짝 없는 요소 cleanup, 미지원 대상 진단.                                                                                                     |
| V-22 | R-19           | 전략별 trigger 1회 요청, 적중 시 추가 네트워크 없이 교체, Save-Data 생략, 캐시 TTL·액션 후 무효화, 부작용 URL 제외.                                                                                                  |
| V-23 | R-20           | 셸 즉시 응답·fallback 후 교체, 토큰 변조·권한 밖 거부, 실패 시 fallback 유지, 선행 transition 우선, prerender 셸에서 동작.                                                                                           |
| V-24 | R-21           | 스키마 위반 필드 오류, JS 없음 POST→303→결과 반영, JS 있음 동일 결과, CSRF 거부, handler 코드 client 미포함.                                                                                                         |
| V-25 | R-22           | SSR·server 교체·client 렌더에서 범위 일치, 다른 컴포넌트·슬롯 자식 비적용, global 탈출, 이동 시 CSS 로드.                                                                                                            |
| V-26 | R-23           | prerender HTML과 SSR 결과 일치, 정적 우선 서빙·BASE_PATH, 요청 의존 코드 빌드 진단, 슬롯·액션·지연 슬롯 동작.                                                                                                        |
| V-27 | R-24/R-25      | 콘텐츠 스키마 위반 원본 위치 진단·언어 parity·rich 렌더 안전성. 이미지 크기 속성·srcset·lazy/priority, CLS 0.1 이하.                                                                                                 |
| V-28 | R-26/NFR-02    | 공통 적합성 테스트(SSR·transition 스트림·abort·지연 슬롯·액션·404·BASE_PATH·cookie)가 전환 전 Express 결과와 동일. 첫 yield 후 cookie 무시·dev 경고, 미들웨어 조기 반환·응답 가공.                                   |
| V-29 | R-26/NFR-05    | 5개 어댑터에서 V-28 통과. 코어 번들에 `node:*`·Express import 없음, 실행 중 fs 접근 없음, Workers 제약 기능 진단, 콜드 스타트·번들 크기 기록.                                                                        |
| V-30 | R-17/NFR-03    | GTM식 fixture가 head·body에 인라인·외부 script·iframe을 동적 주입한 상태에서 클라이언트 이동 20회 후 노드 보존, page_view 20회, CSP 위반 0.                                                                          |
| V-31 | R-27/AG-09     | 실제 GTM·Sentry(npm·Loader)·Datadog RUM(npm·CDN) 기본 설치로 문서 로드와 클라이언트 이동 20회에서 오류 수집·page_view/view 수·fetch 트레이스 헤더·서버 오류 훅·노드 보존·CSP 위반 0, 전역 API 캐시 금지 단위 테스트. |

## 14. 후속 구현 순서와 게이트

실행용 IMPLEMENT.md는 아직 작성하지 않았다. 상세 작업·entry/exit·실행 기록은 검토 후
구체화하며 다음은 순서 후보다. 관련 DC가 미결정이면 해당 단계의 진입 조건을 충족하지 않는다.

| 단계                       | 선행 결정                     | baseline과 종료 확인                                                                                                          |
| -------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0. 기준선 고정             | DC-17 측정 조건               | 기존 pnpm test, client build·production SSR·대표 페이지·문서 로드 이동 측정 기록.                                             |
| 1. 서버 코어·어댑터        | DC-27/DC-28                   | 기존 전체 baseline을 코어 경유로 유지하고 V-28/V-29. 전환 전 Express 결과와 동일. 데모 라우트·scaffold를 ctx API로 일괄 전환. |
| 2. Page/Slot·JSX           | DC-01/DC-07/DC-08/DC-15       | 기존 baseline에 V-03/V-11/V-15. SSR·요청 분리, 데모 라우트 JSX 전환·문자열 layout 제거.                                       |
| 3. 모드·manifest           | DC-02/DC-03/DC-12/DC-16       | baseline과 V-01/V-03/V-05/V-06. 서버 코드 제외·CSS·SSR 분기 실증.                                                             |
| 4. projection·응답·검증    | DC-09/DC-10/DC-13/DC-14/DC-21 | protocol/server/client baseline과 V-02/V-07~V-10/V-23. 안전성·순서·지연 슬롯 토큰 검증.                                       |
| 5. 활성화·액션·pending     | DC-04/DC-05/DC-11/DC-22       | bridge/abort/action baseline과 V-04/V-12/V-13/V-24. 로드 경쟁·로컬 상태·no-JS 액션.                                           |
| 6. 라우터·persist·prefetch | DC-18/DC-19/DC-20             | runtime 수명 분리 후 전체 baseline 유지와 V-19~V-22. 반복 이동 누수·fallback 실증.                                            |
| 7. 콘텐츠·이미지·prerender | DC-24/DC-25/DC-26             | 가이드 parity baseline과 V-26/V-27. 정적 출력·i18n 경로·`content.ts` 일괄 전환.                                               |
| 8. 빌드 플러그인·진단 완성 | DC-16/DC-23                   | baseline·plugin fixture·V-05/V-11/V-16/V-18/V-25. 진단·소스맵·CSS Modules의 dev/prod/scaffold.                                |
| 9. Test Hardening          | 확정 계약·한도                | 전체 baseline과 이상 frame·악성 입력·지연 로드·동시 요청·취소·이동 경쟁 회귀. V-08/V-10/V-13/V-20.                            |
| 10. Integration Test       | DC-06/DC-17·브라우저 범위     | production·BASE_PATH·생성 앱·5개 어댑터 E2E. V-14/V-17/V-18/V-19/V-26/V-29~V-31 판정.                                         |

안전성과 버전 계약은 새로운 HTML·외부 입력 경로를 도입하는 시점에 필요하다.
hardening까지 검증을 미룬다는 의미가 아니다. scaffold는 원본·overrides에 반영하고 생성물을
직접 수정하지 않는다. 후속 문서에는 각 단계의 필수 테스트·통과 기록을 연결한다.

## 15. 참고와 Handoff

단일 파일의 작성 경험은 [Astro components](https://docs.astro.build/en/basics/astro-components/),
빌드 연동 후보는 [Vite plugin API](https://vite.dev/guide/api-plugin#virtual-modules-convention)를
참조했다. StateSurface가 이들 구현·문법과 호환돼야 한다는 요구는 아니다.

- 완료: 현재 코드·작성 예시·실행 분리·mode/metadata/wire/수명·AG-01~AG-05·DC-01~DC-17·
  V-01~V-18과 후속 게이트를 정리했다. 2026-10-13 개정으로 AG-06과 10장(클라이언트 라우터·persist·
  prefetch·지연 server 슬롯·타입 지정 액션·scoped CSS·prerender·콘텐츠 컬렉션·이미지),
  DC-18~DC-26, V-19~V-27과 라우터·콘텐츠 구현 단계를 추가했다. 이어서 AG-07과 11장(런타임 중립 서버 코어·어댑터),
  DC-27/DC-28, V-28/V-29와 구현 단계 1(서버 코어·어댑터)을 추가하고 이후 단계 번호를 하나씩 미뤘다.
  DC-01·DC-02·DC-03·DC-04·DC-05·DC-07·DC-08·DC-09·DC-10·DC-11·DC-12·DC-13·DC-14·DC-16·DC-18·DC-19·DC-20·DC-21·DC-22·DC-24·DC-25·DC-27·DC-28을 결정했고, AG-09(외부 SDK 호환, 8.3·V-31)를 추가했고, AG-08(하위 호환 비고려)에 따라 DC-15를 결정하고 NFR-02·9.2·V-18과 legacy 서술을 일괄 전환 기준으로 바꿨다.
- 다음: 사용자가 두 문서를 검토해 추가 요구와 DC 선택을 정한다. 이후 IMPLEMENT.md와
  MANUAL_TEST_CHECKLIST.md를 작성하고 검증 ID·단계별 기록을 연결한다.
- 블로커: 문서 작성의 외부 조건은 없다. 공개 문법·wire·입력 한도·브라우저·성능의 TBD는 구현 선행 결정이다.
- 현재 기준 커밋: `7fe48921aaf675af7d10a7531b5c181d813a8587` (이번 개정의 기준).
- 기존 코드 검증 기준: `6742026cb91bd06b030ce503da387701f6e1fb6e`, Node 22.12.0,
  pnpm 10.13.1, Vite 7.3.1. 이번 문서 편집에서 runtime 테스트를 재실행한 결과는 아니다.
- 문서 검증: Prettier, 로컬 링크·코드 블록, R/DC/AG/V 정의와 연결, 변경 공백을 검사한다.
