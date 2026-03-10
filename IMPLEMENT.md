# h-state UI Protocol — Implementation Checklist

설계: `DESIGN.md` §4 (h-state UI 디자인 프로토콜)
상태: Draft

---

## Open Decisions

없음. 모든 설계 결정은 `DESIGN.md` §4.6에서 확정됨.

---

## Phase 1: 프로토콜 타입 + 검증

`engine/shared/protocol.ts`에 `UiPatch` 타입과 `ui`/`uiChanged` 검증 로직을 추가한다.
기존 프레임(`ui` 필드 없음)은 동작 변경 없이 통과해야 한다.

**Entry**: 기존 `StateFrameState` 타입, `validateStateFrame` 함수.
**Exit**: `ui`/`uiChanged` 있는 프레임과 없는 프레임 모두 검증 통과. 기존 테스트 깨짐 없음.

### 타입 확장

- [ ] `UiPatch` 타입 정의: `{ classAdd?: string[]; classRemove?: string[]; cssVars?: Record<string, string> }`
- [ ] `StateFrameState`에 optional 필드 추가: `ui?: Record<string, UiPatch | null>`, `uiChanged?: string[]`

### 검증 규칙 추가

- [ ] `ui` 필드 없으면 기존 로직 그대로 통과 (하위 호환)
- [ ] `full:false`일 때 `changed` / `removed` / `uiChanged` 중 최소 1개 존재 검증
- [ ] `uiChanged` 각 key가 `ui`에 존재하는지 검증
- [ ] `removed` 슬롯이 `uiChanged`에 있으면 `uiChanged`에서 무시 (에러 아님)
- [ ] `accumulate:true` 프레임에서 `ui` 필드가 있으면 거부
- [ ] `uiChanged`가 있지만 배열이 아니면 거부

### Baseline Tests

- [ ] 기존 테스트 전체 통과 확인 (regression 없음)
- [ ] `ui` 없는 프레임 → 기존과 동일하게 valid
- [ ] `full:true` + `ui` 있음 → valid
- [ ] `full:false` + `uiChanged`만 있음 (changed/removed 없음) → valid
- [ ] `full:false` + changed/removed/uiChanged 모두 없음 → invalid
- [ ] `uiChanged` key가 `ui`에 없음 → invalid
- [ ] `accumulate:true` + `ui` 있음 → invalid
- [ ] `uiChanged`가 배열이 아님 → invalid

---

## Phase 2: Apply 로직 확장

`applyFrame`을 확장하여 `ui` 상태를 관리한다. `activeUi`를 `activeStates`와 병렬로 유지.

**Entry**: Phase 1 완료 (타입 + 검증).
**Exit**: `applyFrame`이 `ui` 데이터를 올바르게 병합/교체/초기화. 기존 states 동작 변경 없음.

### Apply 함수 확장

- [ ] `applyUi` 함수 추가 (또는 `applyFrame` 반환값 확장)
- [ ] full 프레임: `ui` 전체 교체 (없으면 빈 객체로 초기화)
- [ ] partial 프레임: `uiChanged`에 해당하는 슬롯만 `ui`에서 병합
- [ ] `ui[slot] = null`: 해당 슬롯의 UI override 초기화 (키 제거)
- [ ] `removed` 슬롯: 해당 슬롯의 `ui` 항목도 함께 제거
- [ ] `ui` 필드 없는 프레임: `activeUi` 변경 없음 (하위 호환)

### Baseline Tests

- [ ] `ui` 없는 프레임 → `activeUi` 변경 없음
- [ ] full 프레임 + `ui` → `activeUi` 전체 교체
- [ ] full 프레임 + `ui` 없음 → `activeUi` 빈 객체로 초기화
- [ ] partial + `uiChanged` → 해당 슬롯만 업데이트
- [ ] `ui[slot] = null` → 해당 슬롯 키 제거
- [ ] `removed` 슬롯 → `activeUi`에서도 제거
- [ ] 스타일-only partial (`states: {}`, `uiChanged`만) → 정상 동작

---

## Phase 3: 클라이언트 DOM 패치

`StateSurface` 클래스에서 `activeUi`를 관리하고, 프레임 적용 시 h-state 엘리먼트에 클래스/CSS 변수를 패치한다.

**Entry**: Phase 2 완료 (apply 로직).
**Exit**: transition 스트리밍 시 h-state 엘리먼트에 클래스/CSS 변수가 실시간 반영.

### activeUi 상태 관리

- [ ] `StateSurface`에 `activeUi: Record<string, UiPatch | null>` 필드 추가
- [ ] `applyStateFrame`에서 `applyUi` 호출하여 `activeUi` 갱신
- [ ] `sync()` 내부에서 템플릿 렌더/업데이트 완료 후 `applyUiPatch` 호출

### DOM 패치 함수

- [ ] `applyUiPatch(slotName, el, patch)` 구현:
  - `patch.classRemove` → `el.classList.remove(...)`
  - `patch.classAdd` → `el.classList.add(...)`
  - `patch.cssVars` → `el.style.setProperty(key, value)` for each entry
- [ ] `clearUiPatch(slotName, el)` 구현 (ui=null 또는 removed 시):
  - 이전 `activeUi[slot]`의 classAdd를 remove, cssVars를 removeProperty
- [ ] invalid patch 감지 시 slot skip + `console.warn`

### coalesce 확장

- [ ] `coalescePartials`에서 `ui`/`uiChanged` 병합 처리

### Bootstrap/Hydration

- [ ] `bootstrap()`에서 `__UI__` 스크립트 태그 파싱 → `activeUi` 초기화
- [ ] `hydrate()`에서 초기 `activeUi` 기반으로 h-state 엘리먼트에 패치 적용

### Baseline Tests

- [ ] `ui` 없는 프레임 → DOM 변경 없음
- [ ] `classAdd` → h-state 엘리먼트에 클래스 추가됨
- [ ] `classRemove` → h-state 엘리먼트에서 클래스 제거됨
- [ ] `cssVars` → h-state 엘리먼트에 CSS 변수 설정됨
- [ ] `ui[slot] = null` → 이전 패치 클리어
- [ ] partial coalesce 시 `ui`/`uiChanged` 올바르게 병합
- [ ] hydration 시 초기 ui 패치 적용됨

---

## Phase 4: SSR 지원

SSR 시 첫 full 프레임의 `ui`를 HTML에 반영한다. FOUC 방지.

**Entry**: Phase 3 완료 (클라이언트 DOM 패치).
**Exit**: SSR로 내려준 HTML에 h-state의 class/cssVars가 포함. 클라이언트 hydration 시 `activeUi` 복원.

### initialStates 확장

- [ ] `getInitialStates` 반환값 확장: `{ states, ui }` 또는 별도 `getInitialUi` 함수
- [ ] 첫 full 프레임의 `value.ui`를 추출하여 반환

### fillHState 확장

- [ ] `fillHState`에 `ui` 파라미터 추가
- [ ] `ui[slotName]`이 있으면 h-state 태그에 `class="classAdd값"` 속성 삽입
- [ ] `ui[slotName].cssVars`가 있으면 h-state 태그에 `style="--var: val; ..."` 속성 삽입

### __UI__ 스크립트 태그

- [ ] `buildUiScript(ui)` 함수 추가: `<script id="__UI__" type="application/json">` 생성
- [ ] `routeHandler`에서 `buildUiScript` 호출하여 HTML에 삽입

### Baseline Tests

- [ ] `ui` 없는 SSR → 기존과 동일 (regression 없음)
- [ ] `ui` 있는 SSR → h-state 태그에 class 속성 포함
- [ ] `ui` 있는 SSR → h-state 태그에 style 속성(CSS 변수) 포함
- [ ] `__UI__` 스크립트 태그 생성 확인
- [ ] `ui` 없으면 `__UI__` 스크립트 태그 미생성

---

## Phase 5: 디버그 오버레이 + Public API

디버그 오버레이에 ui 패치 로그를 추가하고, public API barrel에 `UiPatch` 타입을 노출한다.

**Entry**: Phase 4 완료 (SSR 지원).
**Exit**: `?debug=1`에서 ui 패치 이벤트 확인 가능. `state-surface` import에서 `UiPatch` 타입 접근 가능.

### 디버그 오버레이

- [ ] trace 이벤트에 ui 패치 정보 포함 (`applied` 이벤트의 detail에 `ui` 추가)
- [ ] devOverlay에서 ui 패치 로그 표시

### Public API

- [ ] `engine/index.ts` barrel에 `UiPatch` 타입 re-export 추가

### Baseline Tests

- [ ] trace 이벤트에 ui 정보가 포함되는지 확인
- [ ] `UiPatch`가 `state-surface`에서 import 가능한지 확인

---

## Phase 6: 테스트 강화

DESIGN.md §4.6 테스트 매트릭스를 기반으로 edge case와 통합 테스트를 보강한다.

**Entry**: Phase 5 완료.
**Exit**: 전체 테스트 매트릭스 커버. `pnpm test` 전체 통과.

### Validator 강화

- [ ] 모든 UiPatch 필드 조합 (classAdd만, cssVars만, 복합 등)
- [ ] `uiChanged` 빈 배열 + `ui` 빈 객체 edge case
- [ ] `ui` 키가 있지만 값이 유효하지 않은 타입 (숫자, 문자열 등)

### Apply 강화

- [ ] full → partial → full 연속 전환 시 ui 상태 정합성
- [ ] `removed` + `uiChanged` 동시 존재 시 removed 우선 확인
- [ ] 스타일-only partial 연속 적용

### SSR 강화

- [ ] SSR → hydration → transition 전체 흐름 통합 테스트
- [ ] `ui` 있는 SSR + 클라이언트에서 ui 변경 → DOM 정합성

### 통합 테스트

- [ ] Supertest로 transition 엔드포인트에서 `ui` 포함 NDJSON 응답 확인
- [ ] 전체 프레임 흐름 (full+ui → partial+uiChanged → done) end-to-end

---

## Phase 7: 쇼케이스 데모

showcase 사이트에 ui 프로토콜 데모 페이지를 추가한다.

**Entry**: Phase 6 완료 (테스트 통과).
**Exit**: 데모 페이지에서 ui 패치 동작을 시각적으로 확인 가능.

- [ ] 데모 페이지 경로 결정 (예: `/examples/ui-patch`)
- [ ] transition에서 `classAdd`/`classRemove`/`cssVars` 활용 예시
- [ ] 스타일-only partial 업데이트 데모
- [ ] `ui = null` 초기화 데모

---

## 완료 기준 (DoD)

- [ ] `pnpm test` 전체 통과
- [ ] `pnpm build` 성공
- [ ] `ui` 필드 없는 기존 코드가 변경 없이 동작 (하위 호환)
- [ ] SSR → hydration → transition 전체 흐름에서 ui 패치 정상 동작
- [ ] 쇼케이스 데모 페이지에서 시각 확인
