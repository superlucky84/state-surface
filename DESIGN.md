# StateSurface Design (Next)

작성일: 2026-03-08  
상태: Draft (새 설계 문서)

이 문서는 다음 단계 설계를 위한 **활성(working) DESIGN 문서**다.
이전 Phase 설계/구현 문서는 `docs/completed/`로 이동했다.

## 0) 철학/배경 기준선

이 문서의 모든 신규 설계는 `docs/completed/DESIGN.md`에 정리된 프로젝트 철학과 배경을 기준선으로 삼는다.

- Server owns state, client owns DOM projection 원칙 유지
- 페이지 이동은 MPA, 인페이지 변화는 상태 프레임 스트리밍 원칙 유지
- `<h-state>` anchor 중심의 명시적 경계 유지
- 안정성/예측 가능성 우선(escape hatch는 제한적으로 도입)

기준선에서 벗어나는 변경은 사유와 영향 범위를 이 문서에 명시적으로 기록한다.

## 1) 목표

- 다음 릴리스에서 해결할 설계 문제를 명확히 정의한다.
- 코어 경계(프로토콜/런타임/하네스) 기준을 유지한 채 확장 방향을 정한다.
- 구현 전에 결정해야 할 항목을 체크리스트로 관리한다.

## 2) 비목표

- 완료된 Phase 1/2 내용을 이 문서에서 다시 설명하지 않는다.
- 과거 구현 체크리스트를 이 문서에 복사하지 않는다.

## 3) 현재 설계 작업 범위 (초안)

- [ ] 프레임 스펙 확장 범위 확정 (`ui`, `uiChanged` 등)
- [ ] 슬롯 capability 모델의 런타임 계약 확정 (`strict`, `rich`, `unsafe`)
- [ ] SSR/클라이언트 apply 순서와 하위호환 정책 확정
- [ ] validator/observability/보안 가드레일 확정

## 4) h-state UI 디자인 프로토콜 (Draft)

### 4.1 목표와 원칙

동적 스타일 확장을 넣더라도 기존 상태 프로토콜의 안정성을 유지하기 위해, 데이터와 외형을 분리한다.

- `states`: 비즈니스 데이터(템플릿 렌더 입력)
- `ui`: 슬롯 외형 패치(클래스/CSS 변수/허용 스타일 속성)
- `changed`: `states` 변경 슬롯 목록
- `uiChanged`: `ui` 변경 슬롯 목록

### 4.2 프레임 확장 초안 (`ui + uiChanged`)

```ts
type StateFrameState = {
  type: 'state';
  states: Record<string, any>;
  ui?: Record<string, UiPatch | null>;
  full?: boolean;
  accumulate?: boolean;
  changed?: string[]; // states 전용
  removed?: string[]; // states 전용
  uiChanged?: string[]; // ui 전용
};
```

### 4.3 검증 규칙 (초안)

- `full:false`일 때 `changed` / `removed` / `uiChanged` 중 최소 1개는 반드시 존재.
- `changed`의 각 key는 `states`에 존재해야 함.
- `uiChanged`의 각 key는 `ui`에 존재해야 함.
- key 중복 충돌 방지: 같은 key를 `changed`와 `removed`에 동시에 넣지 않음.
- `ui[slot] = null`은 해당 슬롯의 UI override 초기화 의미.

### 4.4 운영 원칙

- 기존 `states` 프로토콜과 하위 호환 유지(`ui`, `uiChanged`는 optional).
- 스타일-only partial 업데이트를 정식 지원(더미 state 강요 금지).
- `ui` 값은 slot capability(`strict | rich | unsafe`)와 allowlist 검증을 통과해야 적용.

### 4.5 스타일-only partial 예시

```json
{
  "type": "state",
  "full": false,
  "states": {},
  "ui": {
    "card:summary": {
      "classAdd": ["tone-warning"],
      "classRemove": ["tone-default"],
      "cssVars": { "--card-accent": "#f59e0b" }
    }
  },
  "uiChanged": ["card:summary"]
}
```

### 4.6 미결정 체크리스트

- [ ] `UiPatch` 스키마 확정 (`classAdd`, `classRemove`, `cssVars`, `style` 허용 범위)
- [ ] capability별 허용 정책 확정 (`strict`, `rich`, `unsafe`에서 각각 무엇을 허용할지)
- [ ] `strict` 모드 CSS 변수 네이밍 규칙 확정 (예: `--ss-*` prefix 강제 여부)
- [ ] 허용 style 속성 allowlist 확정 (`rich` 모드 최소 셋)
- [ ] `full` 프레임에서 `ui` 처리 규칙 확정 (전체 교체 vs 병합)
- [ ] `accumulate` 프레임에서 `ui` 허용 여부 확정 (금지 또는 별도 merge 규칙)
- [ ] `removed`와 `uiChanged` 동시 사용 시 우선순위 규칙 확정
- [ ] 적용 순서 확정 (template 렌더/업데이트 후 UI 패치 적용)
- [ ] SSR 초기 상태에서 `ui`를 주입할지 여부 확정 (stateScript 확장 필요 여부 포함)
- [ ] invalid `ui` 처리 정책 확정 (frame drop / slot skip / soft warning)
- [ ] 보안/안정성 한도 확정 (slot별 크기 제한, 프레임당 스타일 변경 개수 제한)
- [ ] observability 이벤트 확정 (`uiApplied`, `uiRejected`, capability violation trace 포맷)
- [ ] 하위 호환/버전 전략 확정 (구형 클라이언트가 `ui` 필드를 받을 때 동작)
- [ ] 테스트 매트릭스 확정 (validator, apply 순서, SSR, abort/coalesce, 보안 케이스)

## 5) 완료 문서(Archive)

- `docs/completed/DESIGN.md`
- `docs/completed/DESIGN_PHASE2.md`
- `docs/completed/IMPLEMENT.md`
- `docs/completed/IMPLEMENT_PHASE2.md`
