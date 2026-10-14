# StateSurface 2.0 — 단일 파일 작성 모델과 Surface 확장 설계

작성일: 2026-10-13

상태: Draft / Review — 구현 전 검토 초안

요구사항은 [REQUIREMENTS.md](./REQUIREMENTS.md)를 따른다. 사용자와 합의한 목표,
현재 코드의 사실, 구현 방식의 권고와 TBD를 구분한다. 예시의 `Slot`, 지시자와 신규 프레임 필드는
제안이며 현재 공개 API가 아니다.
`ClientRouter`, `transition:persist`, `server:defer`, `defineAction`, `defineCollection`,
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
  `fallback`, `capability`, `resetKey`. 자식 props와 엔진 속성이 섞이지 않는다.
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
  모듈에서 import한다. 라우트 안 보조 파일을 페이지로 잘못 발견하지 않는 규칙과 URL 충돌 진단이 필요하다(DC-16).

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

Vite 플러그인과 가상 모듈 방식을 권고한다(DC-02). 선언 분석·정규화·코드 생성은
플러그인 내부에서 분리하고 dev와 production에서 같은 처리를 호출한다. 가상 모듈에는
client 컴포넌트만 import한다. 이름 조사에 전체 템플릿의 브라우저 import를 사용하지 않는다.
AST 분석은 기존 TS/JS parser를 재사용하며 구체적인 선택은 DC-02에서 정한다.

빌드 manifest는 페이지에서 도달 가능한 컴포넌트 목록과 loader를 만들고, 요청 SSR은 실제
출력한 슬롯 인스턴스·공개 props만 bootstrap에 넣는다. 레이아웃·서버 컴포넌트 안의 선언도
분석해야 하며 조건 때문에 출력되지 않은 아일랜드를 초기 로드하지 않는다. 동적으로 계산한
컴포넌트·ID를 어디까지 허용할지는 DC-02/DC-08에서 정한다. 빌드의 컴포넌트 목록과 요청별
슬롯 인스턴스 목록을 같은 정보로 취급하지 않는다.

새 책임의 배치 후보는 `engine/build/`(Vite 플러그인 `state-surface/vite`)다. 공개 entry는 DC-28의 단일 패키지
subpath를 따른다. `engine/shared/`에 Node 전용 의존성을 섞지 않는다.

- `.tsx`의 정적 import·Slot 선언에서 module ID를 해석한다. 분석할 수 없는 컴포넌트 선택은
  명시 registry를 요구하거나 진단하는 안이다. 정확한 지원 범위는 DC-02/DC-08에서 결정한다.
- static/server 전용 코드는 서버 의존성 그래프에 둔다. lazy import만으로 client 출력에서
  제외됐다고 판정하지 않고 client의 전이 의존성도 검사한다.
- server-only 모듈 표시 방법으로 module marker나 import 규칙을 검토한다. 파일명만으로
  비밀 코드가 없다고 보장하지 않는다. V-05에서는 client 출력 전체에 sentinel이 없는지 검사한다.
- CSS 추출·로딩을 client 청크에 연결한다. 활성화 전후 CSS 누락과 CLS, Tailwind source 탐색,
  runtime UI 클래스 허용 토큰의 생성·포함을 검증한다.
- dev 라우트 로딩은 Vite의 서버 모듈 로드 등 플러그인 transform이 적용되는 경로를 사용한다. tsx 직접
  import만으로는 Slot 분석·지시자 변환이 적용되지 않는다.
- production은 빌드가 생성한 route registry를 사용한다(11.4).
- BASE_PATH, asset manifest, 동적 청크 CSS, 소스맵과 scaffold overrides에 같은 설정을 반영한다.
  기존 `resolveAssetCss()`에도 동적 import의 관련 CSS를 처리하는 계약이 필요하다.

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

- server replace는 내부 HTML과 관련 플러그인 cleanup을 대상으로 한다. 입력·선택·포커스
  보존이 필요한 복잡한 UI는 client로 작성하거나 명시적인 morph 계약을 추가한다(DC-03).
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

Prism·목차·chat scroll·debug는 선언한 페이지와 슬롯에 제한한다(DC-12).
플러그인을 늦게 등록해도 이미 표시된 슬롯을 알려야 하며 server replace 전후 cleanup과
보강을 처리해야 한다. 플러그인과 Lithent가 같은 내부 DOM을 중복 소유하지 않도록 한다.

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

- load는 시작, idle은 requestIdleCallback과 fallback, visible은 IntersectionObserver,
  media는 matchMedia를 사용하는 안이다. threshold·timeout·미지원 동작은 DC-04에서 정한다.
- only는 ssr=false로 정규화하고 단독 사용은 load, 다른 timing과 조합 가능하게 하는 안을
  권고한다. 모드·timing 모순과 여러 timing 동시 지정은 진단한다.
- 모듈 로드 promise는 componentId로 공유하고 인스턴스는 slotId별로 유지한다.
  제거·reset으로 generation이 바뀌면 이전 로드가 완료돼도 mount하지 않는다.
- 휴면 상태에서도 검증된 프레임을 순서대로 reducer에 적용한다. accumulate delta를 먼저
  병합해 최신 props·revision을 보관한다. UI-only 패치는 슬롯 root에 적용할 수 있다.
- SSR DOM과 최신 props가 다르면 SSR snapshot으로 hydrate한 뒤 최신 props를 갱신하는 안을
  권고한다. 최신 props로 바로 hydrate해 일치한다고 가정하지 않는다. snapshot 수명은 DC-05다.
- 활성화 전 입력 가능한 UI는 DOM 초안 수집·활성화 앞당김·fallback 중 정책이 필요하다.
  단순 hydration만으로 사용자의 첫 입력까지 보존된다고 가정하지 않는다.
- data-action의 첫 click/submit을 공통 로더에서 잡고 폼 값을 즉시 snapshot해 한 번 실행하는 안이다.
  임의 이벤트·trusted user activation의 재현은 지원하지 않는다. clipboard/fullscreen 등은
  eager 활성화나 다음 명시적 조작을 사용한다. 정확한 범위는 DC-04/DC-11에서 결정한다.

### 5.3 로컬 상태와 DOM 반영

같은 slotId/componentId/resetKey는 기존 DataProxy·마운트를 사용해 갱신한다(DC-05).
props를 매 render마다 local state에 복사하지 않고 record 변경 시 reset을 명시한다.
DOM 구조·key 변경으로 입력 노드가 제거된 경우까지 포커스 보존을 보장하지 않는다.

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

server accumulate는 요청 내 full baseline에 순서대로 merge하고 그 시점의 HTML을 생성하는
안을 권고한다(DC-10). 브라우저에 server delta 병합을 요구하지 않는다.
요청 간 baseline은 DB 등 서버 소스에서 다시 읽는다. 세션 상태가 필요하면 저장소·revision·
권한을 별도로 정의하며 클라이언트의 임의 snapshot을 신뢰하지 않는다.

### 6.2 혼합 모드 wire 후보

기존 StateFrame에 HTML만 추가해 호환된다고 가정하지 않는다. 다음은 DC-09에서 검토할
versioned envelope 예시이며 v2는 프로토콜 후보명이다.

```json
{
  "version": 2,
  "type": "state",
  "targets": ["article:body", "article:editor"],
  "full": true,
  "states": {
    "article:editor": { "articleId": "42", "saved": true }
  },
  "html": {
    "article:body": "<article>Server-rendered content</article>"
  }
}
```

| 규칙 후보     | 검토 내용                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| targets       | 요청에 등록한 쓰기 대상. 첫 baseline에서 고정하고 프레임으로 확장하지 않는다.                                                        |
| full          | targets의 활성 갱신 집합을 전체 교체한다. 대상 밖과 static 콘텐츠는 유지한다.                                                        |
| states / html | client props / server 렌더 결과. 활성 슬롯은 두 키 집합의 합집합이며 같은 슬롯을 양쪽에 넣지 않는다.                                 |
| partial       | changed가 props/HTML에 존재하고 removed와 충돌하지 않는다. UI-only도 유효하다.                                                       |
| removed       | 대상 슬롯 cleanup·비활성화와 UI 제거. 등록 anchor 자체의 수명은 별도로 관리한다.                                                     |
| accumulate    | 논리 delta는 기존 merge를 사용한다. server는 완성 HTML로, client는 검증된 delta로 변환한다. 혼합 결과의 분리 전송은 TBD다.           |
| UI            | full의 대상 안에서 교체, partial의 uiChanged로 갱신, removed 우선. 대상 밖 UI는 유지한다. static root UI 허용은 registry에서 정한다. |

server state를 bootstrap에서 제외하기 때문에 states만으로 활성 집합을 판정하면 안 된다.
기존 전체 교체 의미는 새 targets 규약으로 대체한다. 구 wire 버전은 지원하지 않는다(AG-08).
version·page/build ID의 전달과 협상, bootstrap, 빈 성공 결과·targets 통지 위치는 TBD다.
지원하지 않는 version은 적용을 멈추고 갱신 안내를 표시하는 방식을 권고한다.

서버 등록 renderer의 HTML과 외부 agent가 만든 raw HTML 입력 경로를 구분한다.
payload의 trusted=true 같은 자기 선언으로 HTML을 허용하지 않는다. 서버 권한·렌더 경로와
접속 소스의 계약을 신뢰 근거로 삼고 외부 프레임은 capability에 맞는 데이터 경로에서 처리한다.

### 6.3 스트림과 단건

| 상태                         | 허용 전이                                                       |
| ---------------------------- | --------------------------------------------------------------- |
| awaiting-baseline            | full state → active. error → failed. partial/accumulate 거부.   |
| active                       | 검증된 state → active. done → completed. 치명적 error → failed. |
| completed / failed / aborted | 추가 state 적용 없음. 요청별 cleanup·trace만 수행.              |

새 wire에서 `full`은 생략할 수 없는 명시 필드로 두는 안을 권고한다(DC-09). accumulate를 full baseline으로 오인하지 않는다.
서버의 기존 done 종료를 유지하고 클라이언트도 후속 프레임을 거부한다. done은 승인된 큐의
DOM 반영을 확정한다. done 없는 EOF 성공 처리 여부는 DC-09/DC-14의 결정 사항이다.

- JSON은 Content-Type으로 읽고 후보 envelope `{ version, frames: [...] }`를 공통 pipeline에
  전달한다. async 단건 handler의 논리 결과를 full+done으로 정규화하는 안이며 정확한 타입은 TBD다.
- 무효 delta를 드롭하고 계속 병합하면 기준 상태가 깨질 수 있다. state/wire 위반은 요청 중단,
  슬롯별 UI 위반은 해당 UI만 skip+trace하는 안이다. 재동기화와 frame bytes·개수·buffer·timeout
  한도는 DC-14에서 정하며 미결정 상태를 외부 입력 릴리스의 통과로 보지 않는다.
- 오류 표시는 대응하는 오류 슬롯으로 한정하는 안이다. 기존 error-as-full이 다른 슬롯을 제거하는
  동작은 새 모델의 오류 표시 범위로 대체한다.
- 취소는 대기 큐와 비동기 DOM 반영도 요청 generation으로 무효화한다. 확정된 결과를 자동
  rollback하지 않는다. 모듈 로드 취소와 액션 실행 취소는 별도로 처리한다.

## 7. 컴포넌트 액션과 Pending UI

useAction 또는 context를 통한 action handle을 client 실행 컨텍스트에서 제공하는 안이다
(DC-11). 함수를 서버 JSON에 직렬화하거나 debug용 window.\_\_surface에 의존하지 않는다.
API 이름·타입은 TBD다. data-action은 간단한 서버 조작의 공개 작성 방식으로 유지한다.

- 초기 동시성은 기존 abort-previous 유지안을 권고한다. keyed queue·병렬 액션은 별도 결정이다.
- loading·hasResult·pending·error·aborted를 요청 ID로 관리한다. 첫 프레임에서 해제되던 기존
  data-pending은 요청 완료까지 유지하는 의미로 바꾸고 첫 결과 도착은 별도 상태(가칭 data-has-result)로 표시한다.
- 승인된 프레임의 상태와 현재 활성 슬롯의 DOM 반영을 액션 완료 조건으로 삼는 안이다.
  visible/media를 기다리는 휴면 아일랜드의 활성화까지 완료를 기다리지 않는다.
- 이전 요청 finally가 새 요청의 UI를 해제하지 않는다. timeout·HTTP·wire·chunk 오류를
  구분하고 첫 결과 후의 실패도 관찰 가능하게 한다. 정확한 action 결과 타입은 TBD다.
- 이벤트 위임과 직접 handler의 우선순위, defaultPrevented, submitter와 복수 폼 값을 정의한다.
  첫 이벤트를 잡은 경로에서 한 번만 실행한다(V-13).

## 8. Capability·UI·입력 안전성

mode는 렌더링 위치, capability는 입력에 허용하는 표현이다. server+strict나 client+rich처럼
조합할 수 있으며 서버 registry가 정책의 정본이다(DC-13).

| capability | 입력·적용 후보                                                                                |
| ---------- | --------------------------------------------------------------------------------------------- |
| strict     | 등록 schema의 데이터만 허용. renderer에서도 text·attribute·URL 문맥별로 안전하게 출력.        |
| rich       | 제한 AST/마크다운. 요소·URL scheme 검증과 raw HTML 기본 비활성화 권고.                        |
| unsafe     | 명시 opt-in. raw HTML과 스크립트 실행을 별도로 결정하고 sandbox iframe 등 격리 필요성을 선택. |

보호 대상은 외부 상태·UI·agent 프레임이다. 신뢰해서 설치한 임의 JS의 격리는 일반 Lithent
인스턴스로 제공하지 않는다. CSS 변수 적용도 완전한 샌드박스가 아니다. 자식 상속, 기존 CSS,
클래스가 유발하는 전체 화면 표시 등의 영향은 허용 정책으로 다룬다.

- 클래스 토큰과 허용 규칙, cssVars의 `--` custom property와 값을 검사한다. UI 패치로 임의
  style 속성·이벤트 속성·selector·외부 stylesheet를 받지 않는다.
- SSR 속성은 문맥별로 escape한다. safeStateJSON의 script 안전성만으로 class/style 속성
  안전성을 충족했다고 보지 않는다. rich renderer의 sanitizer는 선정이 필요하다.
- 초기 SSR UI는 base class/style과 결합해 client와 같은 의미를 갖게 한다. UI reset에서 원래
  클래스·변수 값을 복원하는 범위를 정하고 현재 classRemove·덮어쓴 값의 처리도 검증한다.
- 외부 입력은 schema·capability·크기 한도를 통과시킨다. 위반 시 skip·중단은 DC-13/DC-14에서
  결정한다. 신뢰한 HTTP 경로에서도 SSR 입력 이스케이프를 생략하지 않는다.
- 인증·CSRF·origin 검증은 액션 권한 경계에서 기존 앱 정책과 연결하는 범위로 설계한다.
  surface/build ID를 인증 근거로 사용하지 않는다. 일반 마운트를 보안 경계로 표현하지 않는다.

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
     2. persist 요소 분리 → <head> 병합 → <body> 교체 → persist 요소 재부착
     3. history push/replace, scroll·hash 처리
after-swap
   ↓ discoverAnchors → bootstrap/hydration → 활성화 scheduler → boot transition
page-load  (문서 로드에서도 동일하게 발생)
```

- **runtime 수명 분리**: 현재 `createStateSurface()`는 문서당 1회 실행을 전제로 한다. 이를 문서 수명
  (라우터·액션 위임·로더·플러그인 등록)과 페이지 수명(앵커·인스턴스·bootstrap·boot·옵저버)으로 나누고
  페이지 수명에 `mount(page)` / `dispose()`를 둔다. `bindDeclarativeActions`처럼 `document`에 거는
  리스너는 문서 수명에서 한 번만 등록한다. 플러그인에는 페이지 준비·해제 hook을 추가한다(DC-12/DC-18).
- **head 병합**: title·meta는 새 문서 기준으로 교체한다. stylesheet·modulepreload는 URL 기준으로
  유지·추가하고 새 CSS 로드 완료 후 교체해 FOUC를 막는다. 사라진 stylesheet의 제거 시점과
  `__STATE__`/`__UI__`/`__BOOT__`/`__BASE_PATH__` 같은 bootstrap script는 새 문서에서 다시 읽는다.
- **script 정책**: 엔진 엔트리와 이미 실행한 module script는 다시 실행하지 않는다. 새 페이지에만 있는
  module script는 한 번 실행한다. inline script 재실행은 명시적 표식(가칭 `data-surface-rerun`)이 있을 때만
  허용하는 안이다. 정확한 판정 키는 DC-18에서 정한다.
- **fallback 조건**: View Transition 미지원이면 애니메이션 없이 교체한다(fetch·swap은 유지). 응답 build ID가
  현재와 다르거나 라우터 opt-in이 없는 페이지, 4xx/5xx(오류 페이지 표시 정책은 DC-18), 리다이렉트로 다른
  origin에 도달한 경우는 문서 로드로 넘긴다. JS가 없으면 모든 링크가 일반 이동이다.
- **history·scroll**: `history.state`에 이동 ID와 스크롤 위치를 저장하고 `scrollRestoration = 'manual'`로
  복원한다. back/forward는 popstate에서 같은 파이프라인을 사용하며 캐시된 HTML 재사용 여부는 DC-20이다.
  해시는 교체 후 대상 요소로 스크롤한다. BFCache 복귀(pageshow persisted)와 충돌하지 않게 한다.
- **접근성**: 교체 후 새 `<title>`을 live region으로 announce하고 포커스를 `<main>` 또는 지정 요소로
  이동한다. reduced motion이면 애니메이션 없이 교체한다.
- **상태 연계**: 이동 시작 시 `AbortController`로 진행 중 transition과 이전 이동 fetch를 취소한다(기존
  abort-previous와 같은 generation 모델). 언어 cookie 등 서버 상태는 다음 HTML 요청에 그대로 반영된다.
  POST 폼은 라우터가 가로채지 않고 액션 경로(10.5)로 처리한다.
- **선언 위치**: 레이아웃 head에 `<ClientRouter />`(가칭) 하나를 두는 방식을 권고한다. 같은 레이아웃을
  쓰는 페이지 사이에서만 클라이언트 이동하고, 라우터 선언이 없는 페이지로는 문서 로드로 이동한다.

### 10.2 persist (R-18)

- 교체 전 이전 문서와 새 문서에서 같은 persist ID(가칭 `transition:persist="player"`, 미지정 시 빌드 플러그인이
  안정적 ID 생성)를 찾는다. 짝이 있으면 이전 DOM 노드를 새 위치로 옮기고 새 노드는 버린다.
  짝이 없으면 일반 dispose한다.
- client 아일랜드는 Lithent 인스턴스와 DataProxy를 유지하고 새 페이지 SSR의 props를 DataProxy에 반영한다.
  `transition:persist-props`(가칭)는 props 반영을 생략한다. componentId가 다르면 persist하지 않고 진단한다.
- 노드 이동은 `moveBefore()` 지원 시 사용해 iframe·video·포커스 상태를 보존하고, 미지원이면
  `insertBefore`로 대체한다. 이때 iframe 재로드 가능성을 문서화한다(DC-19).
- server 슬롯과 스트리밍 대상 슬롯은 1차 범위에서 persist 대상이 아니며 선언 시 진단하는 안이다.
  persist 요소의 slotId는 두 페이지에서 같은 의미여야 하고, 진행 중인 액션은 이동 시 abort된다.
- view-transition-name과 persist는 독립이다. persist 요소에도 모핑 애니메이션을 지정할 수 있다.

### 10.3 Prefetch (R-19)

| 전략     | 트리거                                      | 기본 대상                         |
| -------- | ------------------------------------------- | --------------------------------- |
| hover    | pointerenter·focus 후 짧은 지연(값은 DC-20) | 라우터 opt-in 시 링크 기본값 후보 |
| tap      | pointerdown·touchstart                      | 모바일 저비용 기본값 후보         |
| viewport | IntersectionObserver                        | 명시한 링크만                     |
| load     | 페이지 준비 후 idle                         | 명시한 링크만                     |

- 링크 속성(가칭 `data-prefetch="hover"`)과 전역 기본값으로 선언한다. `data-prefetch="false"`로 끈다.
- 라우터가 있으면 fetch한 HTML을 URL 키의 메모리 캐시(크기·TTL은 DC-20)에 넣어 이동에 재사용하고,
  HTML의 modulepreload·stylesheet도 미리 요청한다. 라우터가 없으면 Speculation Rules
  (`prefetch`, 선택적으로 `prerender`)를 사용하고 미지원 시 `<link rel="prefetch">`로 대체한다.
- `navigator.connection.saveData`·느린 유효 연결에서는 viewport/load 자동 prefetch를 생략한다.
  cross-origin·POST·쿼리로 부작용을 일으키는 URL은 대상이 아니다. 인증 응답의 캐시 공유는 같은
  탭 메모리로 제한하고, 로그아웃·언어 전환 같은 액션 후에는 캐시를 비운다.

### 10.4 지연 server 슬롯 (R-20)

```text
페이지 SSR: <h-state name="cart" data-defer> fallback HTML </h-state> + 서명된 props 토큰
   ↓ 페이지 응답 즉시 완료 (prerender/CDN 캐시 가능)
브라우저 로더: GET {BASE_PATH}/_surface/island/:componentId?p=<token>
   ↓ 서버: 토큰 검증 → 쿠키·권한 재확인 → 등록 renderer 실행 → HTML
슬롯 HTML 교체 (server 모드 적용 경로 재사용)
```

- 선언은 `<Slot name="..." mode="server" server:defer fallback={...}>`이다(DC-01). props는 서버가 서명 또는
  암호화한 토큰으로만 전달한다. 클라이언트가 componentId·props를 바꿔 다른 renderer를 실행할 수 없다.
- GET 요청으로 CDN 캐시를 허용할지, 개인화 응답의 `Cache-Control: private` 기본값은 DC-21에서 정한다.
  키 회전과 토큰 크기 한도(초과 시 POST)도 함께 정한다.
- 지연 응답이 오기 전에 같은 슬롯을 대상으로 한 transition 프레임이 적용되면 지연 응답을 버리는
  revision 규칙을 적용한다(5.3 generation 모델 재사용). 실패하면 fallback을 유지하고 재시도 정책을 따른다.
- 같은 페이지의 여러 지연 슬롯은 병렬로 요청한다. 묶음 요청은 후속 최적화다. JS가 없으면 fallback이
  남으므로 fallback은 의미 있는 콘텐츠나 안내여야 한다.
- 기존 boot transition과 비교해 지연 슬롯은 슬롯 단위·캐시 가능한 GET·스트림 없음이 차이다.
  둘 다 지원하며 선택 기준을 가이드에 둔다.

### 10.5 타입 지정 서버 액션과 progressive enhancement (R-21)

```ts
// routes/cart/actions/addItem.ts (가칭)
export default defineAction({
  input: schema({ productId: string(), qty: number().min(1) }),
  accept: 'form', // 'json' | 'form'
  targets: ['cart:summary'],
  handler: async ({ productId, qty }, ctx) => {
    /* 상태 프레임 yield 또는 결과 반환 */
  },
});
```

- 스키마 라이브러리는 DC-22에서 정한다. 런타임 의존성 크기를 고려해 Standard Schema 호환 인터페이스로
  zod·valibot 등을 받는 안을 권고한다. 서버 검증은 필수이고 클라이언트 사전 검증은 선택이다.
- 검증 실패는 `{ ok: false, fieldErrors }` 결과로 반환하고, 폼에 연결된 오류 표시 슬롯 또는 client 컴포넌트가
  이를 렌더링한다. 성공 결과는 기존 상태 프레임(targets 범위)이나 단건 결과로 정규화한다(6장).
- `<form method="post" action={actions.addItem}>`(가칭)은 실제 URL(`{BASE_PATH}/_surface/action/:name`)을
  가진다. JS가 없으면 서버가 액션을 실행한 뒤 원래 페이지로 303 리다이렉트하고 결과·오류를 일회성
  flash로 SSR에 반영한다. JS가 있으면 액션 위임이 submit을 가로채 transition으로 실행한다.
- CSRF 방어(origin 검사 또는 토큰)와 인증 확인은 액션 경계에서 수행한다(8장). 기존 `data-action` +
  `/transition/:name`은 공개 작성 방식으로 유지하되 같은 등록 정보로 정규화한다(DC-11).
- client 컴포넌트용 호출 API(`actions.addItem(input)` 가칭)는 입력·결과 타입을 서버 정의에서 추론한다.
  타입만 공유하고 handler 코드는 client 산출물에 포함하지 않는다(V-05).

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

### 10.7 prerender와 하이브리드 출력 (R-23)

- 페이지 named export(가칭 `export const prerender = true`)로 페이지별로 고른다.
  기본값은 기존과 같은 요청 시 SSR이다. 동적 라우트는 `getStaticPaths()`(가칭)로 params 목록을 제공한다.
- 빌드는 production 서버 번들로 각 경로를 렌더링해 `dist/client/<path>/index.html`로 출력하고, 어댑터
  (11.3)는 정적 파일을 SSR보다 먼저 서빙한다. BASE_PATH는 빌드 시 고정되며 다른 값으로 실행하면 진단한다.
- prerender에서는 요청 객체가 없다. cookie·header·인증을 읽으면 빌드 오류로 진단한다. 현재 쿠키 기반
  언어 선택은 prerender와 양립하지 않으므로 언어별 경로(`/en/...`, `/ko/...`) 생성, 또는 기본 언어
  prerender + 클라이언트 언어 전환 시 transition 사용 중에서 DC-24로 정한다.
- prerender 페이지의 server/client 슬롯, `data-action` transition, 지연 server 슬롯(10.4)은 그대로 동작한다.
  개인화가 필요한 부분은 지연 슬롯으로 분리하는 것을 권고 패턴으로 한다.

### 10.8 콘텐츠 컬렉션 (R-24)

- `content/<collection>/` 디렉터리와 `content/config.ts`(가칭)의 `defineCollection({ schema, loader })`로
  선언한다. 1차 loader는 Markdown(frontmatter)·JSON·YAML 파일이다. 조회 API는
  `getCollection(name, filter?)`, `getEntry(name, id)`(가칭)이며 반환 타입은 스키마에서 추론한다.
- Markdown은 빌드·dev에서 AST로 변환하고 R-10의 rich capability 정책으로 렌더링한다. raw HTML은 기본
  비활성화한다. 기존 가이드의 10개 블록 타입은 Markdown 확장(디렉티브 문법 후보)이나 frontmatter
  블록으로 매핑한다. 매핑 문법은 DC-25다.
- 다국어는 `content/guides/{en,ko}/<slug>.md` 구조와 parity 검사 유틸리티(같은 섹션 ID·블록 수·타입)를
  제공해 현재 테스트 수준의 보장을 유지한다. `shared/content.ts`의 가이드 데이터는 7단계에서 일괄 전환한다.
- 스키마 위반은 파일 경로·필드·라인과 함께 dev 오버레이와 빌드 오류로 표시한다. dev에서는 콘텐츠 파일
  변경 시 해당 페이지를 다시 로드한다. 콘텐츠 조회는 서버 전용이며 client 산출물에 포함하지 않는다(V-05).

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
  경고와 trace를 남긴다. 첫 프레임 전 오류는 쿠키 없이 오류 응답한다. 이 규칙으로 `switch-lang`은 훅 없이
  transition 안에서 쿠키를 쓴다.
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

### 12.2 구현 방식: 전 항목 TBD, 아래는 권고안

- [x] DC-01 (2026-10-13 결정): Slot API·직접 컴포넌트 지시자. ① 서버 갱신 경계는 `<Slot>`, 독립 아일랜드는
      직접 지시자, 둘 다 같은 SlotDefinition으로 정규화 ② `<Slot>` 자식은 컴포넌트 엘리먼트 1개, 그 props가
      슬롯 상태(Astro식 props 전달) ③ `<Slot name>` 필수, 직접 지시자는 자동 ID이며 프레임 대상 불가
      ④ fallback은 `fallback` prop. 근거: transition이 겨냥할 이름 붙은 경계는 필수이고, props=상태로 JSX 타입
      검사를 그대로 쓰며, 작은 아일랜드의 이름 부담을 없앤다. 2.1. V-11/V-15/V-18.
- [ ] DC-02: AST 선언 분석·Vite 가상 모듈. 이름 조사용 eager import를 제거하고 dev/build에 같은
      manifest 생성을 사용한다. 분석 불가능할 때의 명시 registry도 결정한다. V-05/V-16.
- [ ] DC-03: server HTML 적용. 평탄한 슬롯 replace·플러그인 cleanup부터 시작하는 안.
      morph와 입력 보존 범위를 별도로 결정한다. V-02/V-12/V-15.
- [ ] DC-04: 로더 예산·timing·첫 이벤트. gzip 1~2kB는 후보이며 fallback·only 조합·폼 snapshot·
      prefetch·입력 가능한 SSR 정책을 정한다. V-04/V-06/V-13/V-17.
- [ ] DC-05: 로컬 상태·SSR snapshot. DataProxy 재사용, 슬롯·컴포넌트·reset 식별, snapshot hydration
      후 최신 props 반영안을 검증하고 선택한다. V-03/V-04/V-12.
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
- [ ] DC-09: versioned wire·JSON envelope. targets·states·html의 범위별 full을 권고하나 협상·
      bootstrap·빈 성공·done/EOF·async handler 타입은 미결정이다. V-02/V-07/V-08/V-18.
- [ ] DC-10: server accumulate. 요청 내 full 기준 reducer와 HTML 생성안. 요청 간 저장·revision과
      혼합 프레임의 projection을 정한다. V-02/V-07/V-08.
- [ ] DC-11: 컴포넌트 액션·pending·취소. context handle·요청 ID·기존 abort-previous 권고.
      첫 결과/완료·이벤트 우선순위·Promise 결과·renderer 실패를 정한다. V-04/V-08/V-13/V-18.
- [ ] DC-12: 플러그인 선언·지연 lifecycle. 페이지·슬롯 의존성을 명시하고 지연 등록 때도 mount 통지.
      server replace cleanup과 DOM 소유권을 정한다. V-02/V-06/V-15/V-18.
- [ ] DC-13: schema·capability·HTML 안전성. strict 기본·rich allowlist·unsafe opt-in 권고.
      sanitizer·CSS 규칙·unsafe의 script/iframe·UI reset 의미를 결정한다. V-09/V-10/V-15.
- [ ] DC-14: validator·한도·복구. state 위반은 중단, UI 국소 위반은 skip+trace 후보.
      frame/buffer/개수·timeout·EOF·재동기화·외부 source API를 정한다. V-08/V-09/V-10.
- [x] DC-15 (2026-10-13 결정): 전환 범위·기본값. legacy adapter·shim·지원 기간 없이 새 모델을 유일한
      모델로 하고 구 API는 단계별로 제거한다(AG-08, 9.2). 근거: 외부 사용자가 없는 0.x 단계에서 호환 계층의
      설계·번들·테스트 비용이 이득보다 크다. V-01/V-08/V-18.
- [ ] DC-16: 진단·편집기·dev/prod·scaffold. 원본 오류 위치·Slot/지시자 JSX 타입·소스맵·URL 충돌·
      생성 프로젝트와 CSS 계약을 정한다. V-05/V-11/V-16/V-18.
- [ ] DC-17: 초기 JS·응답·실행 시간·INP/CLS·첫 액션. 대표 페이지·환경·통과 수치를 고정해
      NFR-01의 70% 감소와 사용 경험을 함께 판정한다. 클라이언트 이동 지연·반복 이동 메모리(NFR-04)도
      같은 조건에서 고정한다. V-17/V-19.
- [ ] DC-18: 클라이언트 라우터. 레이아웃 head 선언·문서/페이지 수명 분리·head 병합·module script 1회 실행·
      build ID 불일치 시 문서 로드 권고. 오류 응답 표시, inline script 판정 키, 라이프사이클 이벤트 이름·
      payload, GET 폼 가로채기 범위를 정한다. V-19/V-20.
- [ ] DC-19: persist. 빌드 플러그인 안정 ID·componentId 일치 조건·props 반영 기본·`moveBefore()` 우선 권고.
      server/스트리밍 슬롯 persist 금지 여부와 iframe 재로드 허용을 정한다. V-21.
- [ ] DC-20: prefetch. 링크 기본 전략(hover/tap)·지연 시간·HTML 캐시 크기/TTL·back/forward 재사용·
      Speculation Rules 사용 범위·Save-Data 정책과 액션 후 무효화를 정한다. V-22.
- [ ] DC-21: 지연 server 슬롯. 서명/암호화 방식·키 회전·토큰 한도·GET/POST·캐시 헤더·재시도와
      transition revision 우선 규칙을 정한다. V-23.
- [ ] DC-22: 타입 지정 액션. Standard Schema 호환 인터페이스 권고. 액션 URL·no-JS 303/flash 저장소·
      CSRF 방식·결과 타입·기존 data-action과의 정규화를 정한다. V-24.
- [ ] DC-23: scoped CSS. CSS Modules 기본(DC-07에서 확정). 같은 파일 `css` 태그드 템플릿의 후속 도입 여부,
      Tailwind `@apply` 범위와 CSS 청크 배치를 정한다. V-25.
- [ ] DC-24: prerender. 선언 방식·`getStaticPaths` 계약·정적 파일 우선 서빙·BASE_PATH 고정·
      i18n(언어별 경로 vs 기본 언어+transition)과 요청 의존 코드 진단을 정한다. V-26.
- [ ] DC-25: 콘텐츠 컬렉션. 디렉터리·config 위치, loader 범위, Markdown 블록 확장 문법, parity 유틸리티,
      `shared/content.ts` 전환 방식을 정한다. V-27.
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

| ID   | 대상           | 시나리오와 통과 기준                                                                                                                                                               |
| ---- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-01 | R-01           | static에 프레임을 보내도 콘텐츠 유지. action/boot/plugin 없는 페이지는 실행 JS 요청 0건.                                                                                           |
| V-02 | R-02           | server SSR·업데이트 HTML 일치. 단건/스트림·언어 전환·제거 처리, client 템플릿 배제.                                                                                                |
| V-03 | R-03           | 복수 아일랜드의 독립 hydrate/mount/unmount. 같은 컴포넌트의 인스턴스끼리 간섭 없음.                                                                                                |
| V-04 | R-04/R-12      | timing·only·fallback·청크 실패, 휴면 delta·제거 후 load·첫 입력. 유실 없이 최신 상태 반영.                                                                                         |
| V-05 | R-01/R-05/R-11 | 전체 client 산출물에 static/server 전용 모듈·비밀 sentinel 없음. 필요한 컴포넌트·CSS만 로드.                                                                                       |
| V-06 | R-06           | 페이지별 불필요한 plugin/debug 로딩 없음. client 아일랜드 없는 페이지에서 Lithent 배제.                                                                                            |
| V-07 | R-07           | JSON/NDJSON 최종 DOM·state·UI 일치. async handler·실패·빈 결과·Content-Type 규약 준수.                                                                                             |
| V-08 | R-08/R-02      | partial/accumulate first·done 후·깨진 JSON·누락 delta·EOF·한도·취소·병합 순서에 잘못 적용하지 않음.                                                                                |
| V-09 | R-09           | UI-only에서 renderer 미호출. full/partial/null/removed와 SSR/hydration 일치, reset·원래 값 처리 검증.                                                                              |
| V-10 | R-10/NFR-03    | SSR 속성 breakout·script/event URL·악성 rich·capability 승격·UI 타입 위반을 방어하고 허용 밖 적용 차단.                                                                            |
| V-11 | R-11           | `.tsx` 페이지의 layout·조건·반복·slot SSR·metadata 일치. 병렬 요청 사이 데이터 유출 없음.                                                                                          |
| V-12 | R-12           | props 갱신 때 local draft/toggle·유지된 입력 focus 보존. reset·record 교체·제거는 정의된 수명 준수.                                                                                |
| V-13 | R-13           | 첫 submit 값·submitter 유지와 단일 실행. 첫 결과 이후 pending·연속 요청·실패·취소 상태 정확.                                                                                       |
| V-14 | R-14           | MPA·일반 링크·뒤로/앞으로·미지원·reduced motion. 선택한 값만 복원, 스트림 DOM 순서 보존.                                                                                           |
| V-15 | R-15           | 중복 ID·컴포넌트 재사용·미등록/권한 밖 슬롯·부모자식 소유권. 미지원 중첩 진단 또는 검증된 보존·cleanup.                                                                            |
| V-16 | R-16           | import 경계·비 JSON props·지시자·URL 충돌의 원본 진단. dev/prod CSS·소스맵·지시자 변환 일치.                                                                                       |
| V-17 | NFR-01         | 고정 조건에서 총 초기 gzip JS 70% 감소. HTML/JSON/SSR·첫 액션·INP/CLS가 결정된 예산 충족.                                                                                          |
| V-18 | NFR-02         | 전환 후 데모 전 페이지의 언어 전환·boot·abort·스트리밍·UI·액션·BASE_PATH·plugin 동등, 생성 scaffold 동작, 구 API 사용처 0, 버전 불일치 reload.                                     |
| V-19 | R-17/NFR-04    | 링크·GET 폼·뒤로/앞으로 이동 후 DOM·state·boot·action이 문서 로드와 동일. 100회 이동 후 리스너·인스턴스 누적 없음.                                                                 |
| V-20 | R-17           | 진행 중 스트림 abort, head 병합·CSS 선로드, script 1회 실행, opt-out·외부·수정 키·오류·build ID 불일치 fallback, scroll·hash·focus·announce.                                       |
| V-21 | R-18           | persist 아일랜드의 로컬 상태·포커스·재생 유지와 새 props 반영/유지 옵션. 짝 없는 요소 cleanup, 미지원 대상 진단.                                                                   |
| V-22 | R-19           | 전략별 trigger 1회 요청, 적중 시 추가 네트워크 없이 교체, Save-Data 생략, 캐시 TTL·액션 후 무효화, 부작용 URL 제외.                                                                |
| V-23 | R-20           | 셸 즉시 응답·fallback 후 교체, 토큰 변조·권한 밖 거부, 실패 시 fallback 유지, 선행 transition 우선, prerender 셸에서 동작.                                                         |
| V-24 | R-21           | 스키마 위반 필드 오류, JS 없음 POST→303→결과 반영, JS 있음 동일 결과, CSRF 거부, handler 코드 client 미포함.                                                                       |
| V-25 | R-22           | SSR·server 교체·client 렌더에서 범위 일치, 다른 컴포넌트·슬롯 자식 비적용, global 탈출, 이동 시 CSS 로드.                                                                          |
| V-26 | R-23           | prerender HTML과 SSR 결과 일치, 정적 우선 서빙·BASE_PATH, 요청 의존 코드 빌드 진단, 슬롯·액션·지연 슬롯 동작.                                                                      |
| V-27 | R-24/R-25      | 콘텐츠 스키마 위반 원본 위치 진단·언어 parity·rich 렌더 안전성. 이미지 크기 속성·srcset·lazy/priority, CLS 0.1 이하.                                                               |
| V-28 | R-26/NFR-02    | 공통 적합성 테스트(SSR·transition 스트림·abort·지연 슬롯·액션·404·BASE_PATH·cookie)가 전환 전 Express 결과와 동일. 첫 yield 후 cookie 무시·dev 경고, 미들웨어 조기 반환·응답 가공. |
| V-29 | R-26/NFR-05    | 5개 어댑터에서 V-28 통과. 코어 번들에 `node:*`·Express import 없음, 실행 중 fs 접근 없음, Workers 제약 기능 진단, 콜드 스타트·번들 크기 기록.                                      |

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
| 10. Integration Test       | DC-06/DC-17·브라우저 범위     | production·BASE_PATH·생성 앱·5개 어댑터 E2E. V-14/V-17/V-18/V-19/V-26/V-29 판정.                                              |

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
  DC-01·DC-07·DC-08·DC-27·DC-28을 결정했고, AG-08(하위 호환 비고려)에 따라 DC-15를 결정하고 NFR-02·9.2·V-18과 legacy 서술을 일괄 전환 기준으로 바꿨다.
- 다음: 사용자가 두 문서를 검토해 추가 요구와 DC 선택을 정한다. 이후 IMPLEMENT.md와
  MANUAL_TEST_CHECKLIST.md를 작성하고 검증 ID·단계별 기록을 연결한다.
- 블로커: 문서 작성의 외부 조건은 없다. 공개 문법·wire·입력 한도·브라우저·성능의 TBD는 구현 선행 결정이다.
- 현재 기준 커밋: `7fe48921aaf675af7d10a7531b5c181d813a8587` (이번 개정의 기준).
- 기존 코드 검증 기준: `6742026cb91bd06b030ce503da387701f6e1fb6e`, Node 22.12.0,
  pnpm 10.13.1, Vite 7.3.1. 이번 문서 편집에서 runtime 테스트를 재실행한 결과는 아니다.
- 문서 검증: Prettier, 로컬 링크·코드 블록, R/DC/AG/V 정의와 연결, 변경 공백을 검사한다.
