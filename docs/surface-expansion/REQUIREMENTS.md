# StateSurface 2.0 (Surface 전면 확장) — 요구사항 사양서

작성일: 2026-10-13  
상태: Draft — 요구사항 정의 완료, 설계 단계 착수 대기  

---

## 1. 문서 위치와 역할

이 문서는 기존 `docs/idea/`의 아일랜드 설계와 `NEXT_IDEA.md`의 하네스/프로토콜 철학을 계승·통합하여, **StateSurface를 Astro에 필적하는 세련됨과 편리함을 갖춘 모던 아일랜드 & 스트리밍 프레임워크로 전면 확장하기 위한 통합 요구사항**을 정의한다.

| 문서 | 상태 | 역할 |
| :--- | :--- | :--- |
| **[REQUIREMENTS.md](./REQUIREMENTS.md)** | **작성 완료 (현재 문서)** | 목표, 기능/비기능 요구사항, 제약사항, 의사결정 추적 |
| **[DESIGN.md](./DESIGN.md)** | 예정 | 렌더링 모드, 번들 분할, 지시자 파이프라인, 아키텍처 상세 설계 |
| **[IMPLEMENT.md](./IMPLEMENT.md)** | 예정 | 단계별 구현 작업 목록, 테스트 게이트, 마이그레이션 계획 |
| **[MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md)** | 예정 | 릴리스 전 수동 검증 및 성능 측정 시나리오 |

### 관련 코드 베이스
* 코어 런타임: `engine/client/`, `engine/server/`, `engine/shared/`
* 사용자/프로젝트 계층: `client/`, `routes/`, `layouts/`, `shared/`
* 빌드 & 스캐폴딩: `vite.config.ts`, `create-state-surface/`

---

## 2. 배경 및 문제 정의

StateSurface 1.x는 "Server owns state, client owns DOM projection" 철학을 바탕으로 NDJSON 기반 상태 프레임 스트리밍을 성공적으로 구현했다. 그러나 Astro와 같은 최신 아일랜드 프레임워크와 비교할 때 실사용자 및 개발자 관점에서 다음과 같은 한계가 존재한다:

1. **불필요한 클라이언트 JavaScript 전송 (No Zero-JS)**:
   * `auto.ts`의 `eager: true` glob import로 인해 현재 방문한 페이지와 무관한 모든 라우트의 템플릿과 Lithent 런타임이 무조건 초기에 로드된다.
   * 가이드나 소개 페이지처럼 순수 정적 콘텐츠만 있는 경우에도 번들 크기가 비대해진다.
2. **작성 경험의 분리 (DX Split-Brain)**:
   * 페이지 레이아웃은 raw HTML 문자열 결합(`joinSurface`, `stateSlots`), 라우트는 정적 객체 선언, UI 슬롯은 Lithent 컴포넌트로 나뉘어 개발자가 전체 화면을 직관적으로 조망하기 어렵다.
3. **하이드레이션 제어 부재**:
   * 컴포넌트를 브라우저 로딩 즉시(`load`), 화면에 보일 때(`visible`), 유휴 시간(`idle`) 등에 맞춰 지연 활성화하는 선언적 지시자가 없어 세밀한 성능 최적화가 어렵다.
4. **로컬 UI 상태 파괴 위험**:
   * 서버로부터 스트리밍 상태 프레임이 도착할 때 슬롯 템플릿이 리렌더링되면서 사용자가 입력 중이던 폼 초안, 아코디언 열림, 드롭다운 포커스 등 클라이언트 전용 인터랙션 상태가 유실될 위험이 있다.
5. **MPA 전체 새로고침에 따른 화면 깜빡임**:
   * 페이지 간 이동 시 브라우저 하드 리로드가 발생하여 앱과 같은 매끄러운 사용자 경험을 제공하지 못한다.

---

## 3. 핵심 비전: Astro의 우아함 + StateSurface 실시간 스트리밍 커널

StateSurface 2.0의 비전은 **"Astro의 가벼움(Zero-JS by Default)과 편리한 아일랜드 DX"**에 **"StateSurface만의 독보적인 실시간 NDJSON 스트리밍 & AI 에이전트 제어 커널"**을 융합하는 것이다.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   StateSurface 2.0 Core Architecture                   │
├───────────────────────────────────┬────────────────────────────────────┤
│     Astro-Class DX & Islands      │    StateSurface Streaming Kernel   │
│ ───────────────────────────────── │ ────────────────────────────────── │
│ • Zero-JS by Default (정적 슬롯)   │ • 실시간 NDJSON 스트리밍 슬롯      │
│ • 선언적 지시자 (client:visible 등) │ • 세밀한 UI 패치 (class / cssVars) │
│ • 독립된 Lithent 아일랜드 샌드박스 │ • Surface Capability 모델          │
│ • MPA View Transitions 전환       │ • AI Agent-Native 하네스 연결점    │
└───────────────────────────────────┴────────────────────────────────────┘
```

---

## 4. 기능 요구사항 (Functional Requirements)

### 4.1 렌더링 모드 및 아일랜드 아키텍처

* **R-01 (Zero-JS 기본 원칙)**:
  * 슬롯에 아무런 인터랙션 지시자가 지정되지 않은 경우(`static` 모드), 서버에서 SSR된 순수 HTML만 브라우저로 전송하며 해당 슬롯을 위한 템플릿 JS 및 hydration 코드는 클라이언트 번들에서 **0바이트**로 배제되어야 한다.
* **R-02 (서버 전용 렌더링 슬롯 — `server` 모드)**:
  * 인페이지 갱신이 필요하지만 클라이언트 컴포넌트 로직은 불필요한 영역(예: 언어 전환, 서버 필터링 목록)의 경우, 서버의 등록된 템플릿에서 렌더링한 HTML 조각을 전송받아 슬롯 DOM만 교체한다. 클라이언트에 컴포넌트 JS를 내려보내지 않는다.
* **R-03 (인터랙티브 Lithent 아일랜드 — `client` 모드)**:
  * 복잡한 상호작용이 필요한 영역은 독립된 Lithent 컴포넌트로 마운트되며, 서버 데이터 props와 컴포넌트 자체 로컬 상태를 완벽히 활용할 수 있어야 한다.
* **R-04 (선언적 아일랜드 지시자 — Client Directives)**:
  * 개발자는 슬롯이나 컴포넌트에 간단한 속성을 선언하여 브라우저 활성화 시점을 통제할 수 있어야 한다:
    * `client:load`: 페이지 로드 즉시 컴포넌트 청크 로드 및 마운트.
    * `client:idle`: 브라우저 메인 스레드가 유휴 상태(`requestIdleCallback`)일 때 마운트.
    * `client:visible`: 슬롯이 뷰포트에 진입할 때(`IntersectionObserver`) 동적 로드 및 마운트.
    * `client:media="(query)"`: 지정한 미디어 쿼리가 일치할 때 마운트.
    * `client:only`: 서버 SSR을 생략하고 브라우저에서만 마운트.

### 4.2 빌드 파이프라인 및 자동 코드 분할 (Code Splitting)

* **R-05 (온디맨드 템플릿 청크 분할)**:
  * `eager: true` 기반의 전역 glob import를 폐기하고, Vite 플러그인 또는 빌드 매니페스트를 통해 **실제 각 라우트/슬롯에서 요구하는 아일랜드만 동적으로 분할 로드(`import()`)**하는 매핑을 자동 생성해야 한다.
* **R-06 (경량 클라이언트 엔트리 분기)**:
  * 활성화할 인터랙티브 아일랜드가 없는 페이지는 무거운 Lithent 런타임을 배제하고, 최소한의 이벤트 위임(`data-action`) 디스패처만 로드하거나 JS를 완전히 배제할 수 있어야 한다.

### 4.3 스트리밍 프로토콜 및 UI 디자인 패치 확장

* **R-07 (단건 응답 및 스트리밍 응답의 독립 선택)**:
  * NDJSON 스트리밍 외에 일반 단건 `application/json` 응답 모드를 공식 지원하고, 동일한 프레임 파이프라인을 통해 슬롯에 적용할 수 있어야 한다.
* **R-08 (스트림 규약 강제 및 클라이언트 가드레일)**:
  * 스트림의 첫 프레임은 반드시 `full: true`여야 하며, `done` 프레임 수신 이후 추가 프레임 전송을 차단하는 스트림 레벨 계약을 강제해야 한다.
  * 클라이언트는 외부(에이전트 등)에서 주입되는 비정상 프레임을 사전에 검증하고 방어적으로 드롭할 수 있어야 한다.
* **R-09 (UI 디자인 패치 프로토콜 — `ui + uiChanged`)**:
  * 비즈니스 데이터(`states`)와 외형 스타일(`ui`)을 분리하여 `classAdd`, `classRemove`, `cssVars` 형태의 안전한 외형 변경을 데이터 재렌더링 없이 독립적으로 패치할 수 있어야 한다.
* **R-10 (Surface Capability 모델)**:
  * 슬롯별로 허용 수준(`strict` 스키마 데이터 | `rich` 마크다운/블록 AST | `unsafe` raw HTML)을 정의하여 AI 에이전트나 동적 패치 시 안전성을 보장해야 한다.

### 4.4 개발자 경험(DX) 및 상태 공존성

* **R-11 (선언적 슬롯/컴포넌트 작성 모델)**:
  * 문자열 결합(`joinSurface`, `stateSlots`) 중심의 작성을 지양하고, JSX/Lithent 컴포넌트 트리 내에서 슬롯을 자연스럽게 배치할 수 있는 직관적 컴포넌트 API(`<Slot name="..." client:visible />`)를 제공해야 한다.
* **R-12 (서버 Props 스트리밍과 로컬 UI 상태의 공존)**:
  * 서버에서 스트리밍 상태 프레임이 도착하여 props가 갱신되어도, 컴포넌트 인스턴스가 재생성되지 않고 **입력창 포커스, 폼 드래프트, 아코디언 토글 등의 클라이언트 로컬 상태가 안전하게 보존**되어야 한다.
* **R-13 (선언적 서버 액션 & Pending UI)**:
  * `data-action` 외에도 컴포넌트 내부에서 간편하게 서버 transition을 호출할 수 있는 런타임 API를 제공하고, 요청 처리 중 로딩/스피너를 쉽게 표시할 수 있는 pending 프리미티브를 지원해야 한다.
* **R-14 (MPA View Transitions 통합)**:
  * 페이지 이동 시 브라우저 네이티브 View Transitions API를 활용하여, 레이아웃(헤더/네비게이션) 상태를 유지하면서 부드러운 크로스페이드 및 슬라이드 화면 전환을 지원해야 한다.

---

## 5. 비기능 요구사항 (Non-Functional Requirements)

* **NFR-01 (성능 및 번들 예산)**:
  * 정적 안내 페이지(예: 가이드, 홈) 방문 시 초기 전송 JavaScript 크기를 1.x 대비 70% 이상 절감해야 한다.
  * 첫 상호작용 지연 시간(FID/INP) 및 누적 레이아웃 이동(CLS) 지표를 최상위권으로 유지한다.
* **NFR-02 (하위 호환성)**:
  * 기존 StateSurface 1.x로 작성된 `defineTemplate` 및 transition 핸들러가 급격한 코드 수정 없이 점진적으로 2.0 모델로 이행될 수 있도록 호환 레이어를 제공해야 한다.
* **NFR-03 (스타일 및 보안 격리)**:
  * 슬롯의 UI 패치는 해당 슬롯 엘리먼트 스코프를 벗어나 전역 스타일을 오염시키지 않아야 한다 (CSS 변수 격리).
  * `unsafe` 모드를 제외한 모든 슬롯에서는 임의의 악성 스크립트 실행(XSS)이 원천 차단되어야 한다.

---

## 6. 제약사항 및 비목표 (Constraints & Non-Goals)

### 제약사항
1. 페이지 간의 기본 이동 모델은 **MPA(Multi-Page Architecture)**를 유지하며, 인페이지 변경은 명시적인 슬롯 경계를 통한다.
2. 컴포넌트 라이브러리 인터랙션 엔진은 **Lithent**를 기반으로 경량성과 반응성을 극대화한다.
3. Express 기반의 서버 어셈블리와 Vite 기반의 번들링 파이프라인 구조를 준수한다.

### 비목표 (Non-Goals)
1. **React RSC / Flight 프로토콜 복제**: 복잡한 React Server Component 직렬화 프로토콜을 그대로 흉내 내지 않으며, StateSurface만의 단순하고 명확한 슬롯/프레임 프로토콜을 유지한다.
2. **범용 클로저 직렬화 (Universal Resumability)**: Qwik처럼 임의의 자바스크립트 클로저와 반응성 그래프 전체를 HTML에 직렬화하는 과도한 복잡성은 채택하지 않는다.
3. **전체 SPA 전환**: 라우팅 전체를 클라이언트 가상 돔 라우터로 대체하지 않으며, MPA + View Transitions 방식을 견지한다.

---

## 7. 의사결정 추적 (Decision Checklist)

설계(`DESIGN.md`) 및 구현(`IMPLEMENT.md`) 착수 전 반드시 해결해야 할 핵심 의사결정 항목:

| ID | 의사결정 항목 | 후보 안 | 상태 |
| :--- | :--- | :--- | :---: |
| **DC-01** | **슬롯 선언 문법 및 컴포넌트 API 형태** | A: JSX 컴포넌트 `<Slot name="..." client:visible />`<br>B: HTML 커스텀 태그 `<h-state name="..." client:visible>` | 검토 중 |
| **DC-02** | **빌드 타임 청크 매핑 생성 방식** | A: Vite 커스텀 플러그인 기반 가상 모듈 자동 생성<br>B: 빌드 전 route/slot 스캐너 스크립트 실행 | 검토 중 |
| **DC-03** | **서버 전용 슬롯(`server`)의 HTML 치환 방식** | A: 단순 `innerHTML` 전체 교체<br>B: DOM diff/morphing (idiomorph 등) 적용 | 검토 중 |
| **DC-04** | **지시자(`client:*`) 경량 런타임 크기** | 최소 1~2KB 미만의 초경량 관찰자 스크립트 설계 | 검토 중 |
| **DC-05** | **스트리밍 프레임 도착 시 컴포넌트 로컬 상태 보존 메커니즘** | Lithent DataProxy의 selective patch 및 컴포넌트 인스턴스 캐싱 | 검토 중 |
| **DC-06** | **View Transitions 적용 수준** | 기본 브라우저 `document.startViewTransition` 지원 및 fallback | 검토 중 |

---

## 8. 진행 상태 및 Handoff (Status & Next Steps)

* **현재 상태 (Completed)**:
  * 기존 `docs/idea/`, `NEXT_IDEA.md`, Astro 벤치마킹 분석을 종합하여 StateSurface 2.0 전면 확장을 위한 요구사항 사양서(`REQUIREMENTS.md`) 작성 완료.
* **다음 단계 (Next)**:
  * `docs/surface-expansion/DESIGN.md` 작성:
    * DC-01 ~ DC-06 의사결정 구체화
    * Zero-JS 컴파일러/Vite 플러그인 파이프라인 아키텍처 수립
    * `client:*` 지시자 로더 스펙 및 스트리밍 아일랜드 라이프사이클 명세
* **블로커 (Blockers)**:
  * 없음. 사용자 요구사항 방향 합의 완료.
* **기준 커밋 SHA**:
  * `6742026cb91bd06b030ce503da387701f6e1fb6e`
