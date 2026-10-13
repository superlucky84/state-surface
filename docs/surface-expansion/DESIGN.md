# StateSurface 2.0 — 단일 파일 작성 모델과 Surface 확장 설계

작성일: 2026-10-13

상태: Draft / Review — 구현 전 검토 초안

요구사항은 [REQUIREMENTS.md](./REQUIREMENTS.md)를 따른다. 사용자와 합의한 목표,
현재 코드의 사실, 구현 방식의 권고와 TBD를 구분한다. 예시의 `.surface`, `Surface`,
`definePage`, `Slot`과 신규 프레임 필드는 제안이며 현재 공개 API가 아니다.
이번 작업은 두 문서까지다. `IMPLEMENT.md`와 `MANUAL_TEST_CHECKLIST.md`는 검토 후 작성한다.

## 1. 현재 기반과 설계의 출발점

| 경계                | 현재 코드                                                                                   | 재사용·변경 방향                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 페이지 계약         | [routeModule.ts](../../engine/shared/routeModule.ts): `layout(stateScript): string`         | 기존 계약을 유지하면서 서버 페이지 렌더 함수와 메타데이터를 추가한다.             |
| 라우트 발견         | [routeScanner.ts](../../engine/server/routeScanner.ts): `.ts`만 route로 인정                | `.tsx`와 전용 파일의 발견·dev 로드·production 생성 모듈을 연결한다.               |
| JSX·SSR             | [tsconfig.json](../../tsconfig.json), [ssrRenderer.ts](../../engine/server/ssrRenderer.ts)  | Lithent JSX와 `renderToString()`으로 페이지 트리를 렌더링한다.                    |
| 슬롯 채움           | [ssr.ts](../../engine/server/ssr.ts): 문자열의 h-state를 정규식으로 채움                    | 새 트리는 렌더 과정에서 슬롯을 처리하고 정규식 경로는 legacy에 한정하는 방향이다. |
| 컴포넌트 레지스트리 | [templateRegistry.ts](../../engine/shared/templateRegistry.ts): 이름과 TagFunction          | 슬롯 인스턴스·컴포넌트·모드·capability를 분리한다.                                |
| 초기 클라이언트     | [main.ts](../../engine/client/main.ts), [auto.ts](../../engine/client/templates/auto.ts)    | 공통 로더·액션 런타임·아일랜드 로더·플러그인으로 분리한다.                        |
| 상태 적용           | [stateSurface.ts](../../engine/client/stateSurface.ts)                                      | reducer·프레임 큐를 활용하고 비동기 로드와 DOM 반영을 분리한다.                   |
| Lithent 갱신        | [lithentBridge.ts](../../engine/client/lithentBridge.ts)                                    | DataProxy와 기존 마운트를 활용하며 인스턴스 키를 슬롯 ID로 관리한다.              |
| 전송                | [server/index.ts](../../engine/server/index.ts), [ndjson.ts](../../engine/shared/ndjson.ts) | JSON 분기·혼합 모드 projection·스트림 상태 검증을 추가한다.                       |
| UI·MPA              | [protocol.ts](../../engine/shared/protocol.ts), [styles.css](../../client/styles.css)       | 기존 UI 패치와 MPA opt-in을 활용하고 안전성·적용 순서를 보강한다.                 |

기존 코드 검토에서 `pnpm test`는 34개 파일/458개 테스트가 통과했고 client build도 성공했다.
공통 JS는 98.52kB / gzip 추정 28.21kB였다. 이는 새 구조의 측정 결과가 아니다.
happy-dom의 간단한 브리지 실험에서 props 갱신 후 인스턴스 1개, 입력 DOM·초안·포커스
유지를 확인했다. 실제 브라우저, 중첩·제거·reset까지 보장한 결과는 아니다.

안전성 보강 근거도 확인했다. 잘못된 `ui.classAdd` 타입이 현재 프레임 검증을 통과하고,
SSR의 UI 클래스 문자열에 따옴표를 넣으면 추가 HTML 속성이 생성된다.
외부 입력을 허용하기 전에 검증과 속성 이스케이프를 보강해야 한다(V-10).

## 2. 작성 경험

### 2.1 최종 목표: 서버 스크립트와 템플릿을 한 파일에 작성

다음은 가칭 `routes/article/[id].surface`의 작성 예시다. ArticleBody는 서버에서 갱신하고
ArticleEditor는 화면에 들어올 때 활성화한다. 일반 마크업에는 클라이언트 컴포넌트 코드가 없다.

```astro
---
import Layout from '../../layouts/Layout.surface';
import ArticleBody from '../../components/ArticleBody';
import ArticleEditor from '../../components/ArticleEditor';
import { getArticle } from '../../server/articles';

const article = await getArticle(Surface.params.id);
---

<Layout title={article.title}>
  <main>
    <h1>{article.title}</h1>

    <Slot
      name="article:body"
      mode="server"
      component={ArticleBody}
      data={article}
    />

    <Slot
      name="article:editor"
      component={ArticleEditor}
      data={{ articleId: article.id }}
      client:visible
    />
  </main>
</Layout>
```

확장자와 API 이름은 DC-01/DC-07에서 결정한다. 페이지 전체를 자연스러운 트리로 작성하고
`<Slot>`으로 갱신 경계를 표시한다. `<ArticleEditor client:visible />` 직접 문법을 제공하더라도
같은 내부 SlotDefinition으로 변환한다. 자동 생성 ID와 스트리밍에서 사용할 ID의 관계는 TBD다.
예시의 Surface와 Slot은 컴파일러가 제공하는 컨텍스트·내장 경계 후보이며 가져오기 방식도 미결정이다.

### 2.2 선행 검증: 단일 `.tsx` 페이지

TypeScript와 Lithent의 기존 도구로 내부 계약을 먼저 검증하는 후보다.
최종 서버 스크립트·템플릿 형식의 완료 조건을 대체하지 않는다.

```tsx
import { definePage, Slot } from 'state-surface';
import Layout from '../../layouts/Layout';
import ArticleBody from '../../components/ArticleBody';
import ArticleEditor from '../../components/ArticleEditor';
import { getArticle } from '../../server/articles';

export default definePage({
  load: async ({ params }) => getArticle(params.id),
  render: article => (
    <Layout title={article.title}>
      <main>
        <h1>{article.title}</h1>
        <Slot name="article:body" mode="server" component={ArticleBody} data={article} />
        <Slot
          name="article:editor"
          component={ArticleEditor}
          data={{ articleId: article.id }}
          client:visible
        />
      </main>
    </Layout>
  ),
});
```

두 형식을 같은 PageDefinition으로 정규화해 모드·props·액션·SSR 계약을 공유한다.
라우트 안의 보조 파일을 잘못 발견하지 않는 규칙과 같은 URL의 `.ts`/`.tsx`/전용 파일
충돌 진단이 필요하다. 첫 범위는 client 컴포넌트를 별도 `.tsx`에서 import하는 방식을 권고한다.
서버 영역의 임의 클로저를 client 코드로 추출·복원하는 기능은 제공하지 않는다.

### 2.3 요청 시 실행과 데이터 전달

- frontmatter의 요청 데이터 처리는 요청별 async 렌더 함수로 변환한다. 모듈 초기화 시점의
  `await`로 변환해 요청 데이터를 공유하지 않는다. import와 안전한 정의는 모듈에서 관리할 수 있다.
- Context는 params, 요청 정보, 인증된 사용자 등을 서버에서 제공한다. 정확한 공개 API는 TBD다.
- 레이아웃도 같은 서버 렌더 계약으로 props와 children을 받는다. 일반 마크업·조건·반복은
  서버에서 평가한다. 비동기 데이터는 스크립트 영역에서 준비하는 범위부터 시작한다.
- client의 `data`는 명시적으로 공개할 props다. 함수·Request·비밀 값을 자동 직렬화하지 않는다.
  JSON 변환 불가능한 값은 조용히 누락하지 않고 진단한다. Date/BigInt 등의 추가 codec은 TBD다.
- 스타일·이벤트·scoped CSS 문법은 DC-07/DC-16에서 지원 범위를 결정한다. 지원하지 않는
  문법은 원본 위치와 함께 진단한다. 초기 편집기 지원이 없으면 그 제약을 명시한다.

## 3. 컴파일러와 빌드의 경계

```text
단일 파일 / JSX 페이지
        ↓ 구문 분석·선언 검증
PageDefinition + SlotDefinition
        ├─ 서버: 요청 렌더 함수, 등록 렌더러, action과 권한
        ├─ 브라우저 메타데이터: slotId, mode, activation, 공개 props
        └─ client 의존성: 명시한 컴포넌트, 공유 런타임, CSS
                          ↓
                   Vite 청크와 manifest
```

Vite 플러그인과 가상 모듈 방식을 권고한다(DC-02). 구문 분석·선언 정규화·코드 생성은
플러그인 내부에서 분리하고 dev와 production에서 같은 처리를 호출한다. 가상 모듈에는
client 컴포넌트만 import한다. 이름 조사에 전체 템플릿의 브라우저 import를 사용하지 않는다.
AST parser 재사용과 전용 문법 parser 선택은 TBD다.

빌드 manifest는 페이지에서 도달 가능한 컴포넌트 목록과 loader를 만들고, 요청 SSR은 실제
출력한 슬롯 인스턴스·공개 props만 bootstrap에 넣는다. 레이아웃·서버 컴포넌트 안의 선언도
분석해야 하며 조건 때문에 출력되지 않은 아일랜드를 초기 로드하지 않는다. 동적으로 계산한
컴포넌트·ID를 어디까지 허용할지는 DC-02/DC-08에서 정한다. 빌드의 컴포넌트 목록과 요청별
슬롯 인스턴스 목록을 같은 정보로 취급하지 않는다.

새 책임의 배치 후보는 `engine/compiler/`, `engine/build/`다. 공개 패키지·플러그인 entry는
DC-07에서 결정한다. `engine/shared/`에 Node 전용 의존성을 섞지 않는다.

- `.tsx`의 정적 import·Slot 선언에서 module ID를 해석한다. 분석할 수 없는 컴포넌트 선택은
  명시 registry를 요구하거나 진단하는 안이다. 정확한 지원 범위는 DC-02/DC-08에서 결정한다.
- static/server 전용 코드는 서버 의존성 그래프에 둔다. lazy import만으로 client 출력에서
  제외됐다고 판정하지 않고 client의 전이 의존성도 검사한다.
- server-only 모듈 표시 방법으로 module marker나 import 규칙을 검토한다. 파일명만으로
  비밀 코드가 없다고 보장하지 않는다. V-05에서는 client 출력 전체에 sentinel이 없는지 검사한다.
- CSS 추출·로딩을 client 청크에 연결한다. 활성화 전후 CSS 누락과 CLS, 전용 확장자의 Tailwind
  source 탐색, runtime UI 클래스 허용 토큰의 생성·포함을 검증한다.
- 현재 tsx 동적 import에 전용 파일을 직접 전달할 수 없다. dev 라우트 로딩은 Vite의 서버 모듈
  로드 등 transform이 적용되는 경로를 만들어야 한다.
- production은 컴파일된 route registry를 사용하는 방향을 권고한다. 배포된 Node가 원본
  전용 파일을 직접 해석할 수 있다고 가정하지 않는다.
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
결정하며 기존 defineTemplate의 hydration 기본값에는 자동 적용하지 않는다.

### 4.2 SSR과 초기 데이터

| 모드          | SSR                        | 브라우저에 보내는 데이터·코드                                        | 갱신 소유자                           |
| ------------- | -------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| static        | HTML                       | 컴포넌트 JS·재렌더 데이터 불필요                                     | 방문 중 콘텐츠 고정                   |
| server        | HTML                       | 슬롯·액션 메타데이터와 공통 runtime. 입력 데이터는 원칙적으로 비공개 | 서버 렌더 결과를 반영하는 DOM adapter |
| client        | 기본 HTML                  | SSR snapshot props, 공개 metadata, 필요한 시점의 청크                | 활성화된 Lithent 인스턴스             |
| client + only | fallback HTML 또는 빈 경계 | 공개 props와 청크                                                    | 브라우저 최초 mount                   |

server 입력을 `__STATE__`에서 제외하더라도 슬롯의 존재까지 제외하면 안 된다.
DOM 등록 집합, 활성 갱신 대상, client props와 server 전용 상태를 별도로 관리한다.
기존 `__STATE__`/`__UI__`/`__BOOT__`는 legacy 경로에서 유지하고 새 bootstrap은 DC-09에서 정한다.
JSON·속성 직렬화 규칙을 통일하고 초기 UI와 hydration의 중복 적용을 방지한다.

### 4.3 HTML 적용과 중첩

최초 구현은 평탄한 갱신 슬롯과 명시적인 DOM 소유자부터 시작하는 안을 권고한다.
정적 Layout 안에 여러 슬롯을 배치하는 것은 이 제한과 양립한다.

- server replace는 내부 HTML과 관련 플러그인 cleanup을 대상으로 한다. 입력·선택·포커스
  보존이 필요한 복잡한 UI는 client로 작성하거나 명시적인 morph 계약을 추가한다(DC-03).
- server 슬롯의 client 자식은 부모 교체 때 사라진다. 최초 범위에서는 이 조합을 진단하는 안이다.
  지원하려면 stable ID, detach/reattach, cleanup과 props 전달 책임을 검증해야 한다.
- client 내부는 일반 Lithent 자식 컴포넌트로 작성한다. 외부 runtime이 그 내부 DOM을
  HTML로 교체하지 않는다. 서버에서 렌더한 static children 전달 범위는 DC-08에서 정한다.
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
legacy full은 기존 전체 교체를 유지하고 새 targets 규약으로 자동 변경하지 않는다(DC-15).
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

기존 full 생략은 adapter에서 full로 해석하며 accumulate를 full baseline으로 오인하지 않는다.
서버의 기존 done 종료를 유지하고 클라이언트도 후속 프레임을 거부한다. done은 승인된 큐의
DOM 반영을 확정한다. done 없는 EOF 성공 처리 여부는 DC-09/DC-14의 결정 사항이다.

- JSON은 Content-Type으로 읽고 후보 envelope `{ version, frames: [...] }`를 공통 pipeline에
  전달한다. async 단건 handler의 논리 결과를 full+done으로 정규화하는 안이며 정확한 타입은 TBD다.
- 무효 delta를 드롭하고 계속 병합하면 기준 상태가 깨질 수 있다. state/wire 위반은 요청 중단,
  슬롯별 UI 위반은 해당 UI만 skip+trace하는 안이다. 재동기화와 frame bytes·개수·buffer·timeout
  한도는 DC-14에서 정하며 미결정 상태를 외부 입력 릴리스의 통과로 보지 않는다.
- 오류 표시는 대응하는 오류 슬롯으로 한정하는 안이다. 기존 error-as-full이 다른 슬롯을 제거하는
  동작은 새 모델에서 재검토하고 legacy 변경은 명시한다.
- 취소는 대기 큐와 비동기 DOM 반영도 요청 generation으로 무효화한다. 확정된 결과를 자동
  rollback하지 않는다. 모듈 로드 취소와 액션 실행 취소는 별도로 처리한다.

## 7. 컴포넌트 액션과 Pending UI

useAction 또는 context를 통한 action handle을 client 실행 컨텍스트에서 제공하는 안이다
(DC-11). 함수를 서버 JSON에 직렬화하거나 debug용 window.\_\_surface에 의존하지 않는다.
API 이름·타입은 TBD다. data-action은 간단한 서버 조작의 공개 작성 방식으로 유지한다.

- 초기 동시성은 기존 abort-previous 유지안을 권고한다. keyed queue·병렬 액션은 별도 결정이다.
- loading·hasResult·pending·error·aborted를 요청 ID로 관리한다. 기존 첫 프레임용 data-pending은
  호환 모드에서 유지하고 요청 완료까지의 pending과 구분한다.
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

## 9. MPA·호환성·성능

### 9.1 페이지 전환

현재 CSS opt-in을 활용하고 필요한 헤더·내비게이션에 view-transition-name을 지정하는 안이다.
MPA는 두 문서의 snapshot을 시각적으로 연결하며 동일 DOM·JS 인스턴스를 이어가지 않는다.
필요한 메뉴 상태 등은 명시적인 storage나 서버 상태로 복원하고 비밀 값·전체 props·임의
local state를 자동 저장하지 않는다.

인페이지 startViewTransition은 DOM 반영의 선택 기능으로 두고 고속 스트림에서 매 프레임
애니메이션 여부를 DC-06에서 정한다. 미지원·reduced motion·일반 링크·뒤로/앞으로·BFCache는
V-14에서 검증한다. MPA와 동일 문서 전환의 차이는
[브라우저 공식 설명](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document)을 따른다.

### 9.2 기존 API 이행

1. 기존 .ts route, layout(stateScript), defineTemplate과 NDJSON generator는 legacy 경로에서 유지한다.
2. 새 페이지는 PageDefinition과 mode metadata를 opt-in하고 기존 template도 component로 참조할 수 있다.
3. server로 이행할 슬롯과 액션 대상을 명시한다. HTML 응답과 초기 상태 축소를 함께 검증한다.
4. 새 manifest를 사용한다. legacy eager 번들의 비용을 새 페이지 성능 결과에서 숨기지 않는다.
5. 지원하지 않는 wire/build version은 적용 중단·reload 안내·기존 경로 중 정책을 결정한다.

BASE_PATH·초기 UI·boot·abort·플러그인·scaffold를 이행 검증에 포함한다(V-18).
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

## 10. 의사결정 체크리스트

### 10.1 합의한 방향

- [x] AG-01: MPA·명시적 슬롯·NDJSON 스트리밍 유지(R-02/R-08/R-14, V-02/V-08/V-14).
- [x] AG-02: Express·Vite·Lithent 기반 유지(R-03/R-05, V-03/V-05).
- [x] AG-03: 서버 스크립트·마크업·레이아웃·아일랜드를 한 파일의 자연스러운 트리로 작성(R-11, V-11).
- [x] AG-04: 새 작성 모델의 static 기본값과 client 로컬 UI 상태 공존(R-01/R-12, V-01/V-12).
- [x] AG-05: RSC/Flight·임의 클로저 직렬화·전체 SPA는 비목표(R-11, V-05/V-11).

### 10.2 구현 방식: 전 항목 TBD, 아래는 권고안

- [ ] DC-01: Slot API·직접 컴포넌트 지시자. 명시 Slot부터 시작하고 같은 정의로 정규화하는 안.
      갱신 경계와 ID를 보이게 하는 목적이다. V-11/V-15/V-18.
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
- [ ] DC-07: 단일 파일 문법·컴파일러. .surface와 ---는 후보. JSX 내부 계약을 먼저 검증하는 안.
      parser·서버 context·CSS 범위·공개 entry와 최종 문법을 결정한다. V-05/V-11/V-16.
- [ ] DC-08: slotId/componentId·동적 ID·children·중첩. 컴포넌트와 인스턴스를 분리하고 server 부모의
      client 자식은 최초 진단하는 안. V-12/V-15/V-16.
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
- [ ] DC-15: legacy adapter·기본값. 기존 hydration·wire 의미를 유지하고 새 모델은 opt-in.
      엄격한 스트림 검사 영향·지원 기간·비용을 정한다. V-01/V-08/V-18.
- [ ] DC-16: 진단·편집기·dev/prod·scaffold. 원본 오류 위치·전용 문법 타입 검사·소스맵·URL 충돌·
      생성 프로젝트와 CSS 계약을 정한다. V-05/V-11/V-16/V-18.
- [ ] DC-17: 초기 JS·응답·실행 시간·INP/CLS·첫 액션. 대표 페이지·환경·통과 수치를 고정해
      NFR-01의 70% 감소와 사용 경험을 함께 판정한다. V-17.

기존 아이디어 문서의 미결정 항목도 이어받는다. 이전 DC-01은 DC-01/DC-15, DC-02는 DC-02/DC-08,
DC-03은 DC-03/DC-08, DC-04는 DC-09, DC-05는 DC-10, DC-06/DC-07은 DC-04/DC-11,
DC-08은 DC-05, DC-09는 DC-11, DC-10은 DC-09, DC-11은 DC-12, DC-12는 DC-17로 대응한다.
이전 번호는 docs/idea/DESIGN.md의 번호이며 문서 간 같은 번호를 혼동하지 않는다.

## 11. 검증 매트릭스

후속 IMPLEMENT.md·MANUAL_TEST_CHECKLIST.md의 입력이며 실행된 결과가 아니다.

| ID   | 대상           | 시나리오와 통과 기준                                                                                    |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------- |
| V-01 | R-01           | static에 프레임을 보내도 콘텐츠 유지. action/boot/plugin 없는 페이지는 실행 JS 요청 0건.                |
| V-02 | R-02           | server SSR·업데이트 HTML 일치. 단건/스트림·언어 전환·제거 처리, client 템플릿 배제.                     |
| V-03 | R-03           | 복수 아일랜드의 독립 hydrate/mount/unmount. 같은 컴포넌트의 인스턴스끼리 간섭 없음.                     |
| V-04 | R-04/R-12      | timing·only·fallback·청크 실패, 휴면 delta·제거 후 load·첫 입력. 유실 없이 최신 상태 반영.              |
| V-05 | R-01/R-05/R-11 | 전체 client 산출물에 static/server 전용 모듈·비밀 sentinel 없음. 필요한 컴포넌트·CSS만 로드.            |
| V-06 | R-06           | 페이지별 불필요한 plugin/debug 로딩 없음. client 아일랜드 없는 페이지에서 Lithent 배제.                 |
| V-07 | R-07           | JSON/NDJSON 최종 DOM·state·UI 일치. async handler·실패·빈 결과·Content-Type 규약 준수.                  |
| V-08 | R-08/R-02      | partial/accumulate first·done 후·깨진 JSON·누락 delta·EOF·한도·취소·병합 순서에 잘못 적용하지 않음.     |
| V-09 | R-09           | UI-only에서 renderer 미호출. full/partial/null/removed와 SSR/hydration 일치, reset·원래 값 처리 검증.   |
| V-10 | R-10/NFR-03    | SSR 속성 breakout·script/event URL·악성 rich·capability 승격·UI 타입 위반을 방어하고 허용 밖 적용 차단. |
| V-11 | R-11           | JSX/전용 파일의 layout·조건·반복·slot SSR·metadata 일치. 병렬 요청 사이 데이터 유출 없음.               |
| V-12 | R-12           | props 갱신 때 local draft/toggle·유지된 입력 focus 보존. reset·record 교체·제거는 정의된 수명 준수.     |
| V-13 | R-13           | 첫 submit 값·submitter 유지와 단일 실행. 첫 결과 이후 pending·연속 요청·실패·취소 상태 정확.            |
| V-14 | R-14           | MPA·일반 링크·뒤로/앞으로·미지원·reduced motion. 선택한 값만 복원, 스트림 DOM 순서 보존.                |
| V-15 | R-15           | 중복 ID·컴포넌트 재사용·미등록/권한 밖 슬롯·부모자식 소유권. 미지원 중첩 진단 또는 검증된 보존·cleanup. |
| V-16 | R-16           | import 경계·비 JSON props·지시자·URL 충돌의 원본 진단. dev/prod CSS·소스맵·전용 파일 일치.              |
| V-17 | NFR-01         | 고정 조건에서 총 초기 gzip JS 70% 감소. HTML/JSON/SSR·첫 액션·INP/CLS가 결정된 예산 충족.               |
| V-18 | NFR-02         | 기존 route/template/generator·BASE_PATH·boot·UI·abort·plugin·생성 scaffold와 구형 wire/cache 이행 동작. |

## 12. 후속 구현 순서와 게이트

실행용 IMPLEMENT.md는 아직 작성하지 않았다. 상세 작업·entry/exit·실행 기록은 검토 후
구체화하며 다음은 순서 후보다. 관련 DC가 미결정이면 해당 단계의 진입 조건을 충족하지 않는다.

| 단계                    | 선행 결정                 | baseline과 종료 확인                                                                    |
| ----------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| 0. 기준선 고정          | DC-17 측정 조건           | 기존 pnpm test, client build·production SSR·대표 페이지 측정 기록.                      |
| 1. Page/Slot·JSX        | DC-01/DC-07/DC-08/DC-15   | 기존 baseline에 V-03/V-11/V-15. SSR·요청 분리·legacy 보존.                              |
| 2. 모드·manifest        | DC-02/DC-03/DC-12/DC-16   | baseline과 V-01/V-03/V-05/V-06. 서버 코드 제외·CSS·SSR 분기 실증.                       |
| 3. projection·응답·검증 | DC-09/DC-10/DC-13/DC-14   | protocol/server/client baseline과 V-02/V-07~V-10. 안전성·순서의 실패 사례 통과.         |
| 4. 활성화·액션·pending  | DC-04/DC-05/DC-11         | bridge/abort/action baseline과 V-04/V-12/V-13. 로드 경쟁·로컬 상태 보존.                |
| 5. 단일 파일 컴파일러   | DC-07/DC-16               | baseline·compiler fixture·V-05/V-11/V-16/V-18. 최종 문법의 dev/prod/scaffold 사용 가능. |
| 6. Test Hardening       | 확정 계약·한도            | 전체 baseline과 이상 frame·악성 입력·지연 로드·동시 요청·취소 회귀. V-08/V-10/V-13.     |
| 7. Integration Test     | DC-06/DC-17·브라우저 범위 | production·BASE_PATH·생성 앱 E2E. V-14/V-17/V-18 성능·공개 계약 판정.                   |

안전성과 버전 계약은 새로운 HTML·외부 입력 경로를 도입하는 시점에 필요하다.
hardening까지 검증을 미룬다는 의미가 아니다. scaffold는 원본·overrides에 반영하고 생성물을
직접 수정하지 않는다. 후속 문서에는 각 단계의 필수 테스트·통과 기록을 연결한다.

## 13. 참고와 Handoff

단일 파일의 작성 경험은 [Astro components](https://docs.astro.build/en/basics/astro-components/),
빌드 연동 후보는 [Vite plugin API](https://vite.dev/guide/api-plugin#virtual-modules-convention)를
참조했다. StateSurface가 이들 구현·문법과 호환돼야 한다는 요구는 아니다.

- 완료: 현재 코드·작성 예시·실행 분리·mode/metadata/wire/수명·AG-01~AG-05·DC-01~DC-17·
  V-01~V-18과 후속 게이트를 정리했다.
- 다음: 사용자가 두 문서를 검토해 추가 요구와 DC 선택을 정한다. 이후 IMPLEMENT.md와
  MANUAL_TEST_CHECKLIST.md를 작성하고 검증 ID·단계별 기록을 연결한다.
- 블로커: 문서 작성의 외부 조건은 없다. 공개 문법·wire·입력 한도·브라우저·성능의 TBD는 구현 선행 결정이다.
- 현재 기준 커밋: `5ddc5f45d8674a628695a254875cee5bd8966ae9`.
- 기존 코드 검증 기준: `6742026cb91bd06b030ce503da387701f6e1fb6e`, Node 22.12.0,
  pnpm 10.13.1, Vite 7.3.1. 이번 문서 편집에서 runtime 테스트를 재실행한 결과는 아니다.
- 문서 검증: Prettier, 로컬 링크·코드 블록, R/DC/AG/V 정의와 연결, 변경 공백을 검사한다.
